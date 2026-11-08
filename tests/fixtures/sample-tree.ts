import type { Tree } from '../../src/model/types';
import { person, tree, union } from './build';

/**
 * The exact tree parse(SAMPLE_DSL) must return, with no diagnostics. Returns
 * fresh objects on every call. Line numbers refer to SAMPLE_DSL: 1 title,
 * 3 comment, 4-9 and 11-14 union lines, 16 focus. Traits given on later lines:
 * Mary (5), Tom Park (9), Elena and Carlos Ruiz (13), Sarah (14). Sam Park's
 * birth year is approximate (`c1927`). No implied union: line 14 joins the focus pair.
 */
export function sampleTree(): Tree {
  return tree({
    title: 'The Kim & Ruiz Family',
    persons: [
      person('Rose Kim', 4, { birth: 1932, death: 2019, traits: ['kind', 'passionate'] }),
      person('Al Kim', 4, { birth: 1930, death: 2001, traits: ['steady', 'funny'] }),
      person('Mary', 4, { birth: 1955, traits: ['warm', 'Godly'] }),
      person('John', 4, { birth: 1958 }),
      person('Tom Park', 5, { birth: 1952, traits: ['patient', 'wry'] }),
      person('Sarah', 5, { birth: 1980, traits: ['brave', 'curious'] }),
      person('Jin', 5, { birth: 1983 }),
      person('Betty Lee', 6, { birth: 1940 }),
      person('Carl', 6, { birth: 1965 }),
      person('Ana', 7, { birth: 1990 }),
      person('Leo', 8, { birth: 1988 }),
      person('Grace Park', 9, { birth: 1929, death: 2015, traits: ['gentle', 'wise'] }),
      person('Sam Park', 9, { birth: 1927, birthApprox: true, death: 2008, traits: ['bold', 'generous'] }),
      person('Inés Vega', 11, { birth: 1931, death: 2020, traits: ['fierce', 'devout'] }),
      person('Luis Vega', 11, { birth: 1928, death: 1999, traits: ['quiet', 'kind'] }),
      person('Elena', 11, { birth: 1954, traits: ['bright', 'devoted'] }),
      person('Rita Ruiz', 12, { birth: 1929, death: 2018, traits: ['lively', 'proud'] }),
      person('Jorge Ruiz', 12, { birth: 1927, death: 2012, traits: ['hardy', 'honest'] }),
      person('Carlos Ruiz', 12, { birth: 1951, traits: ['witty', 'loyal'] }),
      person('Dave Ruiz', 13, { birth: 1979, traits: ['loyal', 'curious'] }),
      person('Lucia', 13, { birth: 1984 }),
      person('Mia', 14, { birth: 2010, traits: ['sunny', 'artsy'] }),
      person('Noah', 14, { birth: 2013, traits: ['playful', 'kind'] }),
    ],
    unions: [
      union('u0', ['Rose Kim', 'Al Kim'], ['Mary', 'John'], 4),
      union('u1', ['Mary', 'Tom Park'], ['Sarah', 'Jin'], 5),
      union('u2', ['Al Kim', 'Betty Lee'], ['Carl'], 6),
      union('u3', ['Mary', null], ['Ana'], 7),
      union('u4', ['John'], ['Leo'], 8),
      union('u5', ['Grace Park', 'Sam Park'], ['Tom Park'], 9),
      union('u6', ['Inés Vega', 'Luis Vega'], ['Elena'], 11),
      union('u7', ['Rita Ruiz', 'Jorge Ruiz'], ['Carlos Ruiz'], 12),
      union('u8', ['Elena', 'Carlos Ruiz'], ['Dave Ruiz', 'Lucia'], 13),
      union('u9', ['Sarah', 'Dave Ruiz'], ['Mia', 'Noah'], 14),
    ],
    focus: ['Sarah', 'Dave Ruiz'],
  });
}
