// jsdom implements <dialog> without the modal methods the preview dialog uses.
// Completing the element keeps the component behavior under test.
const dialogPrototype = globalThis.HTMLDialogElement?.prototype;
if (dialogPrototype) {
  if (typeof dialogPrototype.showModal !== 'function')
    dialogPrototype.showModal = function showModal(
      this: HTMLDialogElement,
    ): void {
      this.open = true;
    };
  if (typeof dialogPrototype.close !== 'function')
    dialogPrototype.close = function close(this: HTMLDialogElement): void {
      this.open = false;
      this.dispatchEvent(new Event('close'));
    };
}
