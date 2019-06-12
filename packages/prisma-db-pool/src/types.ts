export type PoolDefinition = {
  datamodel: string
  pool: {
    min?: number
    max: number
  }
  auth?: { token: string }
}

export type DBInstance = {
  prismaYmlPath: string
  prismaConfig: string
}
