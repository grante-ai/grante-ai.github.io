/* What the app remembers while it's open. */
export const app = {
  user: null,                          // the signed-in account
  settings: { ask_before: ["delete_file"] },
  agentSession: null,
  pendingAgentMessage: null,           // typed on Home, sent when the agent page opens
  pendingChatMessage: null,            // typed on Home (website), sent when the chat page opens
  chatId: null,
  busy: false,
};
