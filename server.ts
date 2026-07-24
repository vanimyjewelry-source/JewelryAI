import express from "express";
import { createServer } from "http";
import { Server } from "socket.io";
import { createServer as createViteServer } from "vite";
import path from "path";
import cors from "cors";

async function startServer() {
  const app = express();
  const httpServer = createServer(app);
  const io = new Server(httpServer, {
    cors: {
      origin: "*",
      methods: ["GET", "POST"]
    }
  });

  app.use(cors());
  app.use(express.json());

  // --- Agent API Endpoint (For Longxia/LobeChat/External Tools) ---
  // This endpoint can be registered as a "Tool" in external agents.
  app.post("/api/agent/command", (req, res) => {
    const { command, params } = req.body;
    
    console.log(`[Agent Command Received]: ${command}`, params);
    
    // Broadcast the command to all connected frontend clients
    io.emit("agent:command", { command, params });
    
    res.json({ 
      status: "received", 
      message: "Command relayed to frontend workstation.",
      details: { command, params }
    });
  });

  // --- LobeChat Plugin Manifest (Optional) ---
  app.get("/api/agent/manifest", (req, res) => {
    res.json({
      schema_version: "v1",
      name: "JewelryAI_Workstation",
      description: "A professional jewelry AI workstation for generating main images, detail assets, and videos.",
      auth: { type: "none" },
      api: [
        {
          url: "/api/agent/command",
          name: "execute_command",
          description: "Execute a command on the jewelry workstation (e.g., generate_main_image).",
          parameters: {
            type: "object",
            properties: {
              command: {
                type: "string",
                enum: ["generate_main_image", "generate_video", "switch_workflow"],
                description: "The action to perform."
              },
              params: {
                type: "object",
                description: "Parameters for the command (e.g., sku, metal, category)."
              }
            },
            required: ["command", "params"]
          }
        }
      ]
    });
  });

  // --- Vite Middleware ---
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  const PORT = 3000;
  httpServer.listen(PORT, "0.0.0.0", () => {
    console.log(`\n🚀 Jewelry AI Workstation is running!`);
    console.log(`🔗 Local URL: http://localhost:${PORT}`);
    console.log(`🤖 Agent API: http://localhost:${PORT}/api/agent/command\n`);
  });
}

startServer();
