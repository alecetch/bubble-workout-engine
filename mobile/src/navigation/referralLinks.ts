type LinkSource = {
  getInitialURL: () => Promise<string | null>;
  addEventListener: (event: "url", listener: (event: { url: string }) => void) => { remove: () => void };
};

export function captureReferralLinks(source: LinkSource, save: (code: string) => Promise<void>): () => void {
  let active = true;
  let receivedEvent = false;
  let writes = Promise.resolve();
  const capture = (url: string | null) => {
    if (!active || !url) return;
    const code = url.match(/(?:^|\/)ref\/([A-Z2-9]{8})(?:$|\?)/)?.[1];
    if (code) writes = writes.then(() => active ? save(code) : undefined).catch(() => {});
  };
  const subscription = source.addEventListener("url", ({ url }) => {
    receivedEvent = true;
    capture(url);
  });
  void source.getInitialURL().then(url => { if (!receivedEvent) capture(url); }).catch(() => {});
  return () => { active = false; subscription.remove(); };
}
