declare module '@zeit/ncc' {
  import { Dictionary } from 'lodash'

  export type Options = {
    cache?: string | false
    externals?: string[]
    minfiy?: boolean
    sourceMap?: boolean
    sourceMapBasePrefix?: string
    sourceMapRegister?: boolean
    watch?: boolean
    v8cache?: boolean
    quiet?: boolean
    debugLog?: boolean
  }

  export type File = {
    source: string
    permissions: string
  }

  export default function(
    path: string,
    opts?: Options,
  ): Promise<{ files: Dictionary<File>; symlinks: string }>
}
