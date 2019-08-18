import { withDefault, filterMap } from '../src/static/utils'

describe('utils:', () => {
  test('with default', () => {
    expect(withDefault(13, undefined)).toBe(13)
    expect(withDefault(13, 14)).toBe(14)
  })

  test('filter map', () => {
    const squareOdd = (n: number) => (n % 2 === 1 ? n * n : null)
    expect(filterMap([1, 2, 3, 4], squareOdd)).toEqual([1, 9])
  })
})
