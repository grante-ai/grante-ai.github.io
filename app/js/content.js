/* Words used in more than one place: Grante's warnings, why to trust it, and the legal drafts. */

/* ---- About the founder (shown on the About page) -------------------------------
   Change anything between the quotes. To write your bio, type it between the two
   backticks after "bio:". Press Enter twice to start a new paragraph. If the bio is
   left empty, the About page simply doesn't show one.
   Photo: optional. Put a picture in grante_api/static/img/ and write its file name after "photo:". */
export const FOUNDER = {
  hello: "Hi, it's Tango!",
  name: "Tango Bhat",
  title: "Founder, NarSan",
  photo: "",            // leave empty to show your initials, or put a picture in static/img and write its name here
  bio: ``,
};

/* ---- What people use Grante for ------------------------------------------------
   Shown on the sign-in and sign-up screens, on Home, on the empty agent screen, and
   on the About page. "try" is the example that gets typed for you when you click one.
   go: "agent" = a file job, "chat" = Ask Grante AI, "forum" = the forum. */
export const TAGLINE = "Tell your Mac what to do, in plain words.";
export const USES = [
  { icon: "sparkle", go: "agent", title: "Clean up a messy folder",
    text: "Turn a Downloads or Desktop full of loose files into tidy folders with one sentence.",
    try: "Sort my Downloads" },
  { icon: "search", go: "agent", title: "Find a file you lost",
    text: "Can't remember where you saved it? Ask, and Grante searches your folders for it.",
    try: "Find my resume" },
  { icon: "folder", go: "agent", title: "Move and rename without digging",
    text: "Skip the clicking and dragging through Finder. Say where things should go.",
    try: "Move report.pdf from Downloads to Documents" },
  { icon: "plus", go: "agent", title: "Set up for something new",
    text: "Starting a class or a project? Have Grante make the folders for it.",
    try: "Create a folder on my Desktop called Projects" },
  { icon: "trash", go: "agent", title: "Clear out junk safely",
    text: "Grante asks first, and deleted files only go to your Trash, so you can get them back.",
    try: "Delete old-notes.txt from my Desktop" },
  { icon: "file", go: "agent", title: "Open apps by asking",
    text: "Launch an app without hunting for it.",
    try: "Open Notes" },
  { icon: "help", go: "chat", title: "Ask it anything",
    text: "Get things explained, brainstorm ideas, or make a study plan. It can be wrong, so check important facts.",
    try: "Ask Grante AI" },
  { icon: "forum", go: "forum", title: "Talk with your town",
    text: "A forum for your town, your country, and the whole world.",
    try: "Open the forum" },
];
/* The short pitch beside the sign-in and sign-up boxes */
export const PITCH = [
  ["sparkle", "Sorts, moves, renames, and finds your files", "Just type what you want, like \u201cSort my Downloads\u201d."],
  ["lock", "Private by design", "The AI runs on your Mac. Your files are never uploaded."],
  ["shield", "Careful with your stuff", "Asks before deleting, uses the Trash, and never overwrites."],
  ["forum", "A community built in", "Chat with Grante AI, or with people in your own town."],
];

/* The website's own pitch and notes (its file tools need Chrome or Edge, and its AI runs on a server) */
export const TAGLINE_WEB = "Your AI assistant for files, questions, and your town.";
export const PITCH_WEB = [
  ["folder", "Sorts, moves, and finds your files", "In the folders you choose. Works in Chrome or Edge on a computer."],
  ["sparkle", "Ask Grante AI", "Get things explained, brainstorm ideas, or make a plan."],
  ["forum", "A forum for where you live", "One for your town, one for your country, and one for everyone."],
  ["shield", "You stay in charge", "It asks before deleting, and you choose what it can't touch."],
];
export const WEB_NOTE = "On the website, Grante can only use the folders you choose, minus anything on your \u201cKeep Grante out\u201d list. "
  + "Deleted files go to a \u201cGrante Trash\u201d folder instead of your computer's Trash, and Grante can't open apps. "
  + "To decide what to do, Grante's AI server sees your messages and the names of files and folders, never what's inside them.";
export const PRIVACY_WEB = ["On the website", "Chat messages and file requests you send on the website go to Grante's AI server (hosted on Hugging Face) so it can answer. "
  + "For file requests it sees file and folder names, never their contents. NarSan doesn't keep these messages. Your chat history, Archive, "
  + "and folder choices are kept in your browser on this device. The website can only reach folders you choose, and only while you allow it."];

export const CAN_DO = [
  ["Move files and folders", "anywhere in your home folder: Desktop, Documents, Downloads, Pictures, Music, and more."],
  ["Rename files and folders", "including ones you didn't mention, if it misunderstands you."],
  ["Delete files and folders", "by sending them to your Mac's Trash."],
  ["Sort whole folders", "moving every loose file in a folder into new subfolders at once."],
  ["Open apps", "on your computer."],
];

export const RISKS = [
  "Grante is an AI, and AI makes mistakes. It can misunderstand you and act on the wrong file or folder.",
  "Actions happen fast, and there is no “undo” button yet. Putting things back is up to you.",
  "If you turn off approvals in Settings, Grante acts without asking you first.",
  "Emptying your Trash makes files that Grante deleted gone for good.",
  "Don't use Grante on files you can't afford to lose. Keep a backup (for example, with Time Machine).",
];

export const TRUST = [
  ["It runs on your computer", "Grante's AI runs right here on your Mac. Your files and your chats with Grante are never uploaded to NarSan or anyone else."],
  ["It asks before deleting", "By default, nothing gets deleted until you click Allow. You choose which actions need your OK."],
  ["Deleted means Trash, not gone", "Grante never permanently deletes. Everything goes to your Trash, so you can drag it back."],
  ["It never overwrites", "If a file with the same name is already there, Grante leaves both alone instead of replacing one."],
  ["Some folders are off-limits", "Grante can't touch its own files or your Library folder, where your apps keep their data."],
  ["You can see everything it did", "Everything you ask is saved in your Archive, along with exactly what Grante did about it."],
  ["You're in control", "Grante only acts when you ask it to. Close the Grante window in Terminal and it stops completely."],
];

export const TERMS = [
  ["Draft", "These terms are an early draft and haven't been reviewed by a lawyer yet. They'll change before Grante launches publicly."],
  ["Who can use Grante", "You must be at least 13 years old to create an account."],
  ["What Grante does", "Grante is an AI assistant that can chat with you and change files on your computer when you ask it to. You're responsible for checking what it does and for keeping backups of important files."],
  ["No guarantees", "Grante is provided “as is.” AI can be wrong. Don't rely on Grante for medical, legal, financial, or safety decisions."],
  ["The forum", "Be respectful. No harassment, hate, threats, spam, or sharing other people's private information. Posts that break these rules can be removed and accounts can be closed."],
  ["Your account", "Keep your password secret. You need to confirm your email to use Grante. You can delete your account at any time in Account Settings."],
];

export const PRIVACY = [
  ["Draft", "This privacy policy is an early draft and hasn't been reviewed by a lawyer yet."],
  ["What stays on your computer", "Your chats with Grante, your Archive (what you asked Grante to do and what happened), and your settings. These are never uploaded."],
  ["What's stored online", "Your account and your forum activity are stored with Google Firebase, a cloud service NarSan uses: your email, name, username, town, state, and country, plus your forum posts, replies, likes, and dislikes. Firebase handles your password; Grante never saves it. Confirmation codes are sent through EmailJS, an email service NarSan uses."],
  ["Who can see what", "Only you can see your profile details, your chats, and your Archive. In the forum, people in the same forum see your display name, your username, and what you posted, but never your email."],
  ["Checking your town", "When you type your town, Grante sends just the town name and country to a place-lookup service (Open-Meteo, using GeoNames data) to confirm it's a real place. Nothing about you is sent with it."],
  ["Your files", "Grante looks at file and folder names on your computer to do what you ask. Your files and their contents are not sent anywhere."],
  ["Emails we send", "A 6-digit confirmation code when you sign up, a confirmation link if you change your email, and a reset link if you forget your password."],
  ["Deleting your data", "Deleting your account removes your profile, your forum posts, and your chats, Archive, and settings on this computer. Replies you wrote on other people's posts stay unless you delete them first."],
];

export const GUIDELINES = [
  "Be kind. Disagree with ideas, not people.",
  "Never share personal info, like your address, phone number, or school.",
  "No spam, scams, or ads.",
  "Report posts that break the rules instead of arguing.",
];
