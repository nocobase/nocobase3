/**
 * The shape every locale of this plugin follows. English is the source of truth: a key exists here first, and a
 * locale that omits it falls back rather than breaking.
 */
export interface __NOCOBASE_SYMBOL_NAME__Resource {
  readonly greeting: string;
}

const enUS: __NOCOBASE_SYMBOL_NAME__Resource = {
  greeting: __NOCOBASE_HELLO_MESSAGE_LITERAL__,
};

export default enUS;
