// Runs once when the server starts, and Next.js waits for it before serving requests.
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { connectDesktopBridge } = await import("./lib/desktop");
    await connectDesktopBridge();
  }
}
