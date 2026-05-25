export const MCP_TOOLS = [
  {
    name: "share_chat",
    title: "Share Chat",
    description: "Promote a chat to a shared workspace and return a join URL.",
    inputSchema: {
      type: "object",
      properties: {
        chatId: { type: "string", description: "Chat id to share. Must be owned by the API key user." },
        recipients: {
          type: "array",
          items: { type: "string" },
          description: "Optional emails to invite. Informational only until Sprint 4.",
        },
        mode: { type: "string", enum: ["multiplayer", "viewer"], default: "multiplayer" },
      },
      required: ["chatId"],
    },
  },
  {
    name: "list_chats",
    title: "List Chats",
    description: "List chats visible to the authenticated user.",
    inputSchema: {
      type: "object",
      properties: {},
      required: [],
    },
  },
  {
    name: "get_chat",
    title: "Get Chat",
    description: "Return chat metadata and recent messages for a visible chat.",
    inputSchema: {
      type: "object",
      properties: {
        chatId: { type: "string" },
      },
      required: ["chatId"],
    },
  },
  {
    name: "send_message",
    title: "Send Message",
    description: "Append a user message to a visible chat. The in-app agent reply is not invoked by this v0 MCP tool.",
    inputSchema: {
      type: "object",
      properties: {
        chatId: { type: "string" },
        content: { type: "string" },
      },
      required: ["chatId", "content"],
    },
  },
] as const;
