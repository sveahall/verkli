console.log("🚀 Verkli Worker starting...");

// Placeholder for worker entry point
// Add BullMQ queues and job processors here

async function main() {
  console.log("Worker is running");
  
  // Keep the process alive
  process.on("SIGTERM", () => {
    console.log("Received SIGTERM, shutting down...");
    process.exit(0);
  });

  process.on("SIGINT", () => {
    console.log("Received SIGINT, shutting down...");
    process.exit(0);
  });
}

main().catch((err) => {
  console.error("Worker failed to start:", err);
  process.exit(1);
});
