import type { Tree } from '../../src/model/types';
import { person, tree, union } from './build';

/**
 * The exact tree parse(EXAMPLE_DSL) must return, with no diagnostics. Returns
 * fresh objects on every call. Line numbers refer to EXAMPLE_DSL:
 * 1 title, 3 comment, 4-8 union lines, 10 focus. Mary's traits come from line 5;
 * the focus line creates Dave Ruiz and the implied union u5.
 */
export function exampleTree(): Tree {
  return tree({
    title: 'The Kim & Ruiz Family',
    persons: [
      person('Rose Kim', 4, { birth: 1932, death: 2019, traits: ['kind', 'passionate'] }),
      person('Al Kim', 4, { birth: 1930, death: 2001, traits: ['steady', 'funny'] }),
      person('Mary', 4, { birth: 1955, traits: ['warm', 'Godly'] }),
      person('John', 4, { birth: 1958 }),
      person('Tom Park', 5, { birth: 1952 }),
      person('Sarah', 5, { birth: 1980 }),
      person('Jin', 5, { birth: 1983 }),
      person('Betty Lee', 6, { birth: 1940 }),
      person('Carl', 6, { birth: 1965 }),
      person('Ana', 7, { birth: 1990 }),
      person('Leo', 8, { birth: 1988 }),
      person('Dave Ruiz', 10, { birth: 1979, traits: ['loyal', 'curious'] }),
    ],
    unions: [
      union('u0', ['Rose Kim', 'Al Kim'], ['Mary', 'John'], 4),
      union('u1', ['Mary', 'Tom Park'], ['Sarah', 'Jin'], 5),
      union('u2', ['Al Kim', 'Betty Lee'], ['Carl'], 6),
      union('u3', ['Mary', null], ['Ana'], 7),
      union('u4', ['John'], ['Leo'], 8),
      union('u5', ['Sarah', 'Dave Ruiz'], [], 10, true),
    ],
    focus: ['Sarah', 'Dave Ruiz'],
  });
}
