export function createMailUnreadPollingSubscription(
  onActiveChange: (active: boolean) => void
) {
  let subscriberCount = 0;

  return () => {
    subscriberCount += 1;
    if (subscriberCount === 1) onActiveChange(true);

    let subscribed = true;
    return () => {
      if (!subscribed) return;
      subscribed = false;
      subscriberCount -= 1;
      if (subscriberCount === 0) onActiveChange(false);
    };
  };
}
