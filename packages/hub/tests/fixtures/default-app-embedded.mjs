export default async function createDefaultFixtureApp() {
  return {
    fetch() {
      return globalThis.Response.json({ ok: true });
    },
  };
}
