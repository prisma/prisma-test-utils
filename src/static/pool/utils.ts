import * as os from 'os'
import * as path from 'path'

/**
 *
 */
export function getTmpDBFile(): string {
  const tmpDir = os.tmpdir()
  const dbFile = path.join(tmpDir, './db.db')
  return
}
