import { describe, expect, it, vi } from "vitest";
import { captureReferralLinks } from "./referralLinks";

function setup(initial: Promise<string | null> = Promise.resolve(null)) {
  let listener: (event: { url: string }) => void = () => {};
  const remove = vi.fn();
  const save = vi.fn().mockResolvedValue(undefined);
  const cleanup = captureReferralLinks({ getInitialURL: () => initial,
    addEventListener: (_, callback) => { listener = callback; return { remove }; },
  }, save);
  return { save, remove, cleanup, emit: (url: string) => listener({ url }) };
}
const flush = async () => { for (let i = 0; i < 8; i++) await Promise.resolve(); };
describe("referral link capture", () => {
  it("captures a cold referral and a later warm referral", async () => {
    const context = setup(Promise.resolve("formai://ref/ABCD2345"));
    await flush();
    expect(context.save).toHaveBeenCalledWith("ABCD2345");
    context.emit("https://getforma.fit/ref/WXYZ6789?source=smoke");
    await flush();
    expect(context.save).toHaveBeenLastCalledWith("WXYZ6789");
  });
  it("does not let a slow initial URL overwrite a newer event", async () => {
    let resolve!: (url: string) => void;
    const context = setup(new Promise(r => { resolve = r; }));
    context.emit("formai://ref/WXYZ6789");
    resolve("formai://ref/ABCD2345");
    await flush();
    expect(context.save).toHaveBeenCalledExactlyOnceWith("WXYZ6789");
  });
  it("ignores malformed links and unsubscribes on unmount", async () => {
    const context = setup();
    context.emit("formai://ref/invalid");
    context.cleanup();
    context.emit("formai://ref/ABCD2345");
    await flush();
    expect(context.save).not.toHaveBeenCalled();
    expect(context.remove).toHaveBeenCalledOnce();
  });
  it("tolerates native/storage errors and continues handling links", async () => {
    const context = setup(Promise.reject(new Error("native unavailable")));
    context.save.mockRejectedValueOnce(new Error("storage unavailable"));
    context.emit("formai://ref/ABCD2345");
    await flush();
    context.emit("formai://ref/WXYZ6789");
    await flush();
    expect(context.save).toHaveBeenLastCalledWith("WXYZ6789");
  });
});
