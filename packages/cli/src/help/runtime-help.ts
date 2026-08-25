import { Command, Help, type Interfaces } from '@oclif/core';

export function isTopicIndexCommand(
  commandId: string,
  topics: Array<Pick<Interfaces.Topic, 'name'>>,
): boolean {
  if (!commandId) {
    return false;
  }

  return topics.some((topic) => topic.name.startsWith(`${commandId}:`));
}

/**
 * A topic such as `app` is listed under TOPICS already, so its bare index command would show up a second time under
 * COMMANDS without adding anything.
 */
export default class RuntimeHelp extends Help {
  protected override get sortedCommands(): Command.Loadable[] {
    return super.sortedCommands.filter(
      (command) => !isTopicIndexCommand(command.id, this.config.topics),
    );
  }

  protected override get sortedTopics(): Interfaces.Topic[] {
    return super.sortedTopics.filter((topic) => !topic.hidden);
  }
}
