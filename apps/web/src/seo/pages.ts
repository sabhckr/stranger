/**
 * Keyword landing pages. Each is pre-rendered to its own HTML file at build time and also served
 * by the SPA router. Titles stay under ~60 characters, descriptions under ~160.
 */
export interface SeoSection {
  h2: string;
  paragraphs: string[];
  bullets?: string[];
}

export interface SeoPage {
  slug: string;
  path: string;
  title: string;
  description: string;
  h1: string;
  intro: string;
  sections: SeoSection[];
  faq?: ReadonlyArray<{ q: string; a: string }>;
}

export const SEO_PAGES: readonly SeoPage[] = [
  {
    slug: 'stranger-chat',
    path: '/stranger-chat',
    title: 'Stranger Chat – Free Anonymous Chat With Strangers',
    description:
      'Start a stranger chat in one click: STRANGER pairs you with a random person for private text or video chat, matched by interests. Free, anonymous, no sign-up.',
    h1: 'Stranger chat, the simple way',
    intro:
      'A stranger chat is a private, one-to-one conversation with someone you have never met. On STRANGER you press Start, we pair you with a random person, and the two of you talk by text or video until one of you presses Next. No account, no profile, no history.',
    sections: [
      {
        h2: 'How stranger chat works on STRANGER',
        paragraphs: [
          'Pick text or video, optionally add a few interests, confirm you are 18 or older, and press Start. The matchmaker looks for a stranger who shares one of your interests first; if nobody does within a few seconds it pairs you with anyone who is waiting in the same mode.',
          'Once matched you see a short intro line, the interests you share, and a message box. Press Next to skip to a new stranger, Stop to end the chat, or Leave to go back to the start page.',
        ],
      },
      {
        h2: 'What makes this stranger chat safer',
        paragraphs: [
          'Every chat has Report and Block within reach. Reports go to moderators with the reason and, if you choose, the last messages as you saw them. People reported by several different users are suspended automatically, and blocked people are never matched with you again.',
        ],
        bullets: [
          'Adults only: an 18+ confirmation is required before matching.',
          'Nothing is stored: messages are relayed in real time and never written to disk.',
          'Anonymous by default: no names, emails or phone numbers are collected.',
        ],
      },
      {
        h2: 'Text chat or video chat?',
        paragraphs: [
          'Text chat is quick, works on any device and keeps you fully anonymous. Video chat is face to face: your browser asks for camera and microphone access only when you press Start, and the stream travels directly between the two browsers over encrypted WebRTC. You can mute or switch the camera off at any moment and keep chatting by text.',
        ],
      },
      {
        h2: 'Tips for a good stranger chat',
        paragraphs: [
          'Open with a question about one of the shared interests, keep the first messages short, and skip quickly if the conversation is not for you. Never share your address, workplace, bank details or passwords, and assume anything on camera could be screenshotted.',
        ],
      },
    ],
  },
  {
    slug: 'stranger-talk',
    path: '/stranger-talk',
    title: 'Stranger Talk – Talk to a Random Stranger Right Now',
    description:
      'Stranger talk made easy: STRANGER connects you with a random person for a free, anonymous one-to-one conversation by text or video. Skip anytime, no sign-up.',
    h1: 'Stranger talk: a real conversation with someone new',
    intro:
      'Stranger talk is the small adventure of talking to a person you know nothing about. It can be a five-minute laugh, a language practice session or a surprisingly honest conversation. STRANGER makes it instant: one click and you are talking.',
    sections: [
      {
        h2: 'Starting the conversation',
        paragraphs: [
          'The hardest part of any stranger talk is the first line. STRANGER helps by showing the interests you share, so you can start with "You like films too — seen anything good lately?" instead of "hi". If you have no shared interests, ask where in the world they are chatting from or what they are doing today.',
        ],
      },
      {
        h2: 'Keeping it going',
        paragraphs: [
          'Ask open questions, react to what the other person says, and share a little about yourself without giving away identifying details. The typing indicator shows when the stranger is writing, so give them a moment before sending the next message.',
        ],
      },
      {
        h2: 'Ending politely',
        paragraphs: [
          'There is no obligation to stay. A quick "nice talking, take care" and the Next button is perfectly fine. If someone is rude or makes you uncomfortable, press Stop, report them, and block them so you never meet again.',
        ],
      },
      {
        h2: 'Why talk to strangers at all?',
        paragraphs: [
          'People use stranger talk to practise a language, to hear a perspective from another country, to kill time on a commute, or simply because talking to someone with no history is refreshing. Whatever your reason, keep it kind and keep it anonymous.',
        ],
      },
    ],
  },
  {
    slug: 'talk-to-strangers',
    path: '/talk-to-strangers',
    title: 'Talk to Strangers Online – Free, Anonymous, No Sign-Up',
    description:
      'Talk to strangers online for free. STRANGER pairs you with a random person for private text or video chat, with interest matching, instant Next, report and block.',
    h1: 'Talk to strangers online, anonymously',
    intro:
      'STRANGER is a free place to talk to strangers online. There is no registration and no profile: open the site, confirm you are an adult, choose text or video and you are paired with a random person within seconds.',
    sections: [
      {
        h2: 'Why people talk to strangers online',
        paragraphs: [
          'Some want to practise English, Spanish or another language with a native speaker. Some are curious about life in other places. Some just want a conversation that is not tied to their real name, their friends or their social feed. A random stranger chat offers all of that without strings attached.',
        ],
      },
      {
        h2: 'How STRANGER pairs you',
        paragraphs: [
          'Add interests such as music, football, coding or travel and the matchmaker prefers strangers who share one of them. After a short wait it widens the search to everyone in the same mode, so you are never stuck waiting. Press Next at any time to meet someone else.',
        ],
      },
      {
        h2: 'The house rules',
        paragraphs: [
          'Talking to strangers only works when everyone feels safe. These rules are enforced by reports, automatic suspensions and moderators.',
        ],
        bullets: [
          'You must be 18 or older.',
          'No nudity, harassment, hate speech or anything involving minors.',
          'No spam, scams, advertising or asking for money.',
          'Do not record or share other people without their consent.',
        ],
      },
      {
        h2: 'Staying anonymous',
        paragraphs: [
          'STRANGER does not ask for your name and never shows anything about you to the other person. Keep it that way: do not share your address, school, workplace or financial details, and move on quickly from anyone who pushes for them.',
        ],
      },
    ],
  },
  {
    slug: 'random-video-chat',
    path: '/random-video-chat',
    title: 'Random Video Chat With Strangers – Free & Private',
    description:
      'Free random video chat with strangers: encrypted peer-to-peer video, camera on only when you choose, interest matching, Next and Stop, report and block. 18+.',
    h1: 'Random video chat with strangers',
    intro:
      'Meet a random stranger face to face. STRANGER video chat connects two browsers directly over encrypted WebRTC, so your video goes to the other person and nowhere else. You decide when the camera turns on, and you can mute or switch it off at any time.',
    sections: [
      {
        h2: 'How random video chat works here',
        paragraphs: [
          'Choose Video chat on the start page and press Start. Your browser asks for camera and microphone access; nothing is requested before that. While we look for a partner you see your own preview only. When a stranger is found the two browsers negotiate a direct connection and the video appears. Text chat stays available alongside the video.',
        ],
      },
      {
        h2: 'Camera controls and privacy',
        paragraphs: [
          'Use the microphone and camera buttons to mute or go dark without ending the chat. Pressing Next, Stop or Leave closes the connection and releases your camera. STRANGER never records or stores video, and even a relay server, when one is needed for difficult networks, cannot decrypt it.',
        ],
      },
      {
        h2: 'What you need',
        paragraphs: [
          'A modern browser (Chrome, Edge, Firefox or Safari), a camera and microphone, and a secure HTTPS page, which this site provides. On most home and mobile networks the connection is direct; some office or campus networks block it, in which case Next usually finds a partner with a compatible network.',
        ],
      },
      {
        h2: 'Safety on camera',
        paragraphs: [
          'Nudity and sexual content are banned and lead to suspension. Keep identifying details, documents and house numbers out of frame, and remember that the other person could screenshot the call. Report anything inappropriate with one tap.',
        ],
      },
    ],
  },
  {
    slug: 'omegle-alternative',
    path: '/omegle-alternative',
    title: 'Omegle Alternative – STRANGER, a Safer Random Chat',
    description:
      'STRANGER is a free Omegle alternative: random text and video chat with strangers, interest matching, instant Next, one-tap report and block, no stored chats. 18+.',
    h1: 'A safer Omegle alternative',
    intro:
      'Omegle introduced the idea of talking to a random stranger with one click, and it shut down in 2023. STRANGER keeps what people loved about it, instant anonymous matching by text or video, and rebuilds the parts that did not age well: moderation, privacy and age rules.',
    sections: [
      {
        h2: 'What is the same',
        paragraphs: [
          'You press one button and talk to a random person. There is no account, no profile and no friend list. Interests, Next and Stop work the way you remember, and text chat runs alongside video.',
        ],
      },
      {
        h2: 'What is different',
        paragraphs: [
          'STRANGER was designed around safety and privacy from the first line of code.',
        ],
        bullets: [
          'Adults only, with the 18+ confirmation required before any matching.',
          'Report and Block on every chat, automatic suspension after multiple reports, and a moderation console.',
          'No chat content is stored on the server; reports keep only a short excerpt for review.',
          'Blocked people are never matched with you again, even days later.',
          'Interest matching that prefers shared interests but never leaves you waiting.',
        ],
      },
      {
        h2: 'Switching from other random chat sites',
        paragraphs: [
          'There is nothing to migrate: open STRANGER, confirm your age, add the interests you used before, and start. If you used to video chat, the controls are in the same places, with mute and camera-off buttons on the video itself.',
          'STRANGER also works well on phones. The layout adapts to small screens, video and text share the screen, and the Next, Stop, Report and Block buttons stay within thumb reach, so an Omegle-style chat on the go feels natural.',
        ],
      },
    ],
    faq: [
      {
        q: 'Is STRANGER free like Omegle was?',
        a: 'Yes. STRANGER is free to use and does not require an account.',
      },
      {
        q: 'Does STRANGER have interests like Omegle?',
        a: 'Yes. Add interests before you start; the matchmaker prefers strangers who share one of them.',
      },
      {
        q: 'Is STRANGER moderated?',
        a: 'Yes. Every chat has Report and Block, repeated reports suspend a user automatically, and moderators review reports.',
      },
    ],
  },
];

export function seoPageFor(path: string): SeoPage | undefined {
  const clean = path.replace(/\/+$/, '') || '/';
  return SEO_PAGES.find((p) => p.path === clean);
}
