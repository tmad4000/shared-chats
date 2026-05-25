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
  {
    name: "list_context",
    title: "List Context",
    description: "List context resources visible to the authenticated user for a chat.",
    inputSchema: {
      type: "object",
      properties: {
        chatId: { type: "string" },
      },
      required: ["chatId"],
    },
  },
  {
    name: "attach_context",
    title: "Attach Context",
    description: "Attach a small text or file context resource to a visible chat. Content must be 100KB or smaller.",
    inputSchema: {
      type: "object",
      properties: {
        chatId: { type: "string" },
        kind: { type: "string", enum: ["text", "file"] },
        name: { type: "string" },
        content: { type: "string" },
        mimeType: { type: "string" },
        permission: { type: "string", enum: ["private", "shared"], default: "shared" },
      },
      required: ["chatId", "kind", "name", "content"],
    },
  },
  {
    name: "remove_context",
    title: "Remove Context",
    description: "Remove a context resource from a chat if the API key user uploaded it or owns the chat.",
    inputSchema: {
      type: "object",
      properties: {
        chatId: { type: "string" },
        resourceId: { type: "string" },
      },
      required: ["chatId", "resourceId"],
    },
  },
] as const;
