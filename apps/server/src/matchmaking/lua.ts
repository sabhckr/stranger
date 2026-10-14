/**
 * Lua scripts executed atomically inside Redis. Atomicity is what makes pairing safe across
 * many server nodes: a ticket can only ever be claimed once.
 *
 * Key layout (all prefixed with `mm:`):
 *   mm:ticket:<ticketId>            HASH  sessionId nodeId clientHash mode interests(json) enqueuedAt lastPartner
 *   mm:queue:<mode>                 ZSET  score = enqueuedAt, member = ticketId
 *   mm:interest:<mode>:<interest>   ZSET  score = enqueuedAt, member = ticketId
 *   block:<clientHash>              SET   clientHashes blocked by this client
 */

export const MATCH_LUA = `
local ticketId   = ARGV[1]
local now        = tonumber(ARGV[2])
local fallbackMs = tonumber(ARGV[3])
local rematchGraceMs = tonumber(ARGV[4])
local scanLimit  = tonumber(ARGV[5])

local function hget_all(key)
  local flat = redis.call('HGETALL', key)
  if #flat == 0 then return nil end
  local h = {}
  for i = 1, #flat, 2 do h[flat[i]] = flat[i + 1] end
  return h
end

local t = hget_all('mm:ticket:' .. ticketId)
if not t then return nil end
local mode = t.mode
local interests = cjson.decode(t.interests)
local waited = now - tonumber(t.enqueuedAt)
local tFallbackReady = (#interests == 0) or (waited >= fallbackMs)

local function shared(a, b)
  local set, out = {}, {}
  for _, x in ipairs(a) do set[x] = true end
  for _, y in ipairs(b) do if set[y] then out[#out + 1] = y end end
  return out
end

local function remove_ticket(id, h)
  redis.call('DEL', 'mm:ticket:' .. id)
  redis.call('ZREM', 'mm:queue:' .. h.mode, id)
  for _, i in ipairs(cjson.decode(h.interests)) do
    redis.call('ZREM', 'mm:interest:' .. h.mode .. ':' .. i, id)
  end
end

local function eligible(candId, requireFallback)
  if candId == ticketId then return nil end
  local c = hget_all('mm:ticket:' .. candId)
  if not c then
    -- stale index entry; clean it up
    redis.call('ZREM', 'mm:queue:' .. mode, candId)
    return nil
  end
  if c.mode ~= mode then return nil end
  if c.clientHash == t.clientHash then return nil end
  if waited < rematchGraceMs and (t.lastPartner == c.clientHash or c.lastPartner == t.clientHash) then
    return nil
  end
  if redis.call('SISMEMBER', 'block:' .. t.clientHash, c.clientHash) == 1 then return nil end
  if redis.call('SISMEMBER', 'block:' .. c.clientHash, t.clientHash) == 1 then return nil end
  if requireFallback then
    local ci = cjson.decode(c.interests)
    local cWaited = now - tonumber(c.enqueuedAt)
    if #ci > 0 and cWaited < fallbackMs then return nil end
  end
  return c
end

-- 1) prefer the oldest ticket sharing an interest
for _, interest in ipairs(interests) do
  local cands = redis.call('ZRANGE', 'mm:interest:' .. mode .. ':' .. interest, 0, scanLimit - 1)
  for _, candId in ipairs(cands) do
    local c = eligible(candId, false)
    if c then
      remove_ticket(ticketId, t)
      remove_ticket(candId, c)
      return { candId, c.sessionId, c.nodeId, c.clientHash, cjson.encode(shared(interests, cjson.decode(c.interests))) }
    end
  end
end

-- 2) fall back to anyone in the same mode once both sides have waited long enough
if tFallbackReady then
  local cands = redis.call('ZRANGE', 'mm:queue:' .. mode, 0, scanLimit - 1)
  for _, candId in ipairs(cands) do
    local c = eligible(candId, true)
    if c then
      remove_ticket(ticketId, t)
      remove_ticket(candId, c)
      return { candId, c.sessionId, c.nodeId, c.clientHash, cjson.encode(shared(interests, cjson.decode(c.interests))) }
    end
  end
end
return nil
`;

export const DEQUEUE_LUA = `
local ticketId = ARGV[1]
local flat = redis.call('HGETALL', 'mm:ticket:' .. ticketId)
if #flat == 0 then return 0 end
local h = {}
for i = 1, #flat, 2 do h[flat[i]] = flat[i + 1] end
redis.call('DEL', 'mm:ticket:' .. ticketId)
redis.call('ZREM', 'mm:queue:' .. h.mode, ticketId)
for _, i in ipairs(cjson.decode(h.interests)) do
  redis.call('ZREM', 'mm:interest:' .. h.mode .. ':' .. i, ticketId)
end
return 1
`;
