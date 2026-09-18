import { DefaultNamingStrategy, type NamingStrategyInterface } from 'typeorm';

function snake(value: string): string {
  return value
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1_$2')
    .toLowerCase();
}

/**
 * Maps camelCase entity properties to snake_case database columns, matching
 * the hand-written SQL migrations. With `synchronize: false` this only
 * affects query building (INSERT/UPDATE/WHERE column names); relation join
 * columns are declared explicitly on the entities, so no other overrides are
 * needed.
 */
export class SnakeNamingStrategy
  extends DefaultNamingStrategy
  implements NamingStrategyInterface
{
  override tableName(
    targetName: string,
    userSpecifiedName: string | undefined,
  ): string {
    return userSpecifiedName ?? snake(targetName);
  }

  override columnName(
    propertyName: string,
    customName: string | undefined,
    embeddedPrefixes: string[],
  ): string {
    const prefix = embeddedPrefixes
      .map((embedded) => `${snake(embedded)}_`)
      .join('');
    return `${prefix}${customName ?? snake(propertyName)}`;
  }
}
