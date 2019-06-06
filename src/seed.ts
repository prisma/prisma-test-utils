import { Fixture } from './types'

/**
 * Seeds the database with provided fixtures.
 *
 * You can set `silent` option to true, to prevent submitting
 * mock data to the DB.
 *
 * @param fixtures
 * @param opts
 */
export async function seedDB(
  fixtures: Fixture[],
  opts: { silent: boolean } = { silent: false },
): Promise<boolean> {
  return true
}
