const { Server } = require("@modelcontextprotocol/sdk/server/index.js");
const { StdioServerTransport } = require("@modelcontextprotocol/sdk/server/stdio.js");
const { CallToolRequestSchema, ListToolsRequestSchema } = require("@modelcontextprotocol/sdk/types.js");
const { zod } = require("zod");

const server = new Server(
  {
    name: "assignify-mcp",
    version: "1.0.0",
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

const tools = [
  {
    name: "analyze_assignment_structure",
    description: "Analyze the structure of an assignment text to plan a handwriting layout.",
    inputSchema: {
      type: "object",
      properties: {
        text: { type: "string", description: "The extracted text from the assignment" },
        pages: { type: "number", description: "Target number of pages" }
      },
      required: ["text"]
    }
  },
  {
    name: "generate_handwriting_style",
    description: "Generate handwriting style parameters based on user description.",
    inputSchema: {
      type: "object",
      properties: {
        description: { type: "string", description: "User description like 'messy student' or 'neat cursive'" }
      },
      required: ["description"]
    }
  }
];

server.setRequestHandler(ListToolsRequestSchema, async () => {
  return { tools };
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments } = request.params;

  if (name === "generate_handwriting_style") {
    // Logic to generate style parameters
    const desc = arguments.description.toLowerCase();
    const style = {
      slant: desc.includes("cursive") ? 0.6 : 0.3,
      spacing: desc.includes("wide") ? 0.7 : 0.4,
      size: desc.includes("large") ? 0.8 : 0.5,
      pressure: desc.includes("bold") ? 0.8 : 0.5,
      messiness: desc.includes("messy") ? 0.7 : 0.2,
      fontMix: ["Caveat", "Cedarville Cursive"]
    };
    return {
      content: [{ type: "text", text: JSON.stringify(style, null, 2) }]
    };
  }

  if (name === "analyze_assignment_structure") {
    // This tool would normally call Gemini, but for now we provide a structure template
    const analysis = {
      linesFound: arguments.text.split('\n').length,
      estimatedPages: Math.ceil(arguments.text.length / 500),
      recommendation: "Use left alignment for question numbers and indent answers by 25px."
    };
    return {
      content: [{ type: "text", text: JSON.stringify(analysis, null, 2) }]
    };
  }

  throw new Error(`Tool not found: ${name}`);
});

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Assignify MCP Server running on stdio");
}

main().catch((error) => {
  console.error("Fatal error in main():", error);
  process.exit(1);
});
