import { err, ok, type Result } from './result';

export type UndoableCommand<T, E> = {
  id?: string;
  execute(): Promise<Result<T, E>>;
  undo(): Promise<Result<void, E>>;
};

export async function executeCommandsOrRollback<T, E>(
  commands: UndoableCommand<T, E>[],
): Promise<Result<T[], E>> {
  const executed: UndoableCommand<T, E>[] = [];
  const results: T[] = [];

  for (const command of commands) {
    let result: Result<T, E>;
    try {
      result = await command.execute();
    } catch (error) {
      await rollbackCommands(executed);
      throw error;
    }

    if (!result.ok) {
      await rollbackCommands(executed);
      return err(result.error);
    }

    executed.push(command);
    results.push(result.value);
  }

  return ok(results);
}

async function rollbackCommands<E>(commands: UndoableCommand<unknown, E>[]): Promise<void> {
  const failures: Array<{ id?: string; error: unknown }> = [];

  for (let i = commands.length - 1; i >= 0; i -= 1) {
    const command = commands[i];
    try {
      const result = await command.undo();
      if (!result.ok) {
        failures.push({ id: command.id, error: result.error });
      }
    } catch (error) {
      failures.push({ id: command.id, error });
    }
  }

  if (failures.length === 0) {
    return;
  }

  throw new Error(
    failures.length === 1
      ? `Rollback failed for command${failures[0].id ? ` ${failures[0].id}` : ''}`
      : `Rollback failed for ${failures.length} commands`,
    { cause: failures },
  );
}
