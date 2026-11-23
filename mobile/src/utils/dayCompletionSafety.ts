import { Alert } from "react-native";

export function showOfflineCompletionAlert(): void {
  Alert.alert("You're offline",
    "Your sets are saved on this phone. Finish the workout when you're back online and we'll add it to your year.",
    [{ text: "OK" }]);
}

export class CompletionWaitTimeout extends Error {
  constructor() { super("Couldn't finish the workout. Check your connection and try again."); }
}

export async function withCompletionTimeout<T>(request: Promise<T>, milliseconds: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([request, new Promise<never>((_resolve, reject) => {
      timer = setTimeout(() => reject(new CompletionWaitTimeout()), milliseconds);
    })]);
  } finally { clearTimeout(timer); }
}
