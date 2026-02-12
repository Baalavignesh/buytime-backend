import { neonDatabaseClient } from "./db/client";

console.log("Hello via Bun!");

Bun.serve({
    port: process.env.PORT || 8080,
    fetch(req) {
      return new Response("BuyTime API is running");
    },
  });
  
  console.log("Server running on port", process.env.PORT || 8080);