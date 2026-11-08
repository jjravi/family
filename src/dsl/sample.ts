/**
 * The DSL example from the architecture spec, verbatim: `title:` is line 1 and
 * the text ends with a newline. tests/fixtures/example-tree.ts holds the exact
 * tree parse() must return for it; change both together.
 */
export const EXAMPLE_DSL = `title: The Kim & Ruiz Family

# partners -> children. Details may be given on first mention or any later one.
Rose Kim 1932-2019 "kind, passionate" + Al Kim 1930-2001 "steady, funny" -> Mary 1955, John 1958
Mary "warm, Godly" + Tom Park 1952 -> Sarah 1980, Jin 1983
Al Kim + Betty Lee 1940 -> Carl 1965        # remarriage: same name, same person
Mary + ? -> Ana 1990                        # unknown partner
John -> Leo 1988                            # single parent

focus: Sarah + Dave Ruiz 1979 "loyal, curious"
`;

/**
 * The first-screen poster, loaded when the URL is empty. Extends EXAMPLE_DSL so
 * both focus people have parents and all four grandparents, and adds the
 * couple's two children for the descendant layout. Its share URL (~0.8 KB)
 * fits the QR budget. tests/fixtures/sample-tree.ts holds the exact tree
 * parse() must return for it; change both together.
 */
export const SAMPLE_DSL = `title: The Kim & Ruiz Family

# partners -> children. Details may be given on first mention or any later one.
Rose Kim 1932-2019 "kind, passionate" + Al Kim 1930-2001 "steady, funny" -> Mary 1955, John 1958
Mary "warm, Godly" + Tom Park 1952 -> Sarah 1980, Jin 1983
Al Kim + Betty Lee 1940 -> Carl 1965        # remarriage: same name, same person
Mary + ? -> Ana 1990                        # unknown partner
John -> Leo 1988                            # single parent
Grace Park 1929-2015 "gentle, wise" + Sam Park c1927-2008 "bold, generous" -> Tom Park "patient, wry"

Inés Vega 1931-2020 "fierce, devout" + Luis Vega 1928-1999 "quiet, kind" -> Elena 1954
Rita Ruiz 1929-2018 "lively, proud" + Jorge Ruiz 1927-2012 "hardy, honest" -> Carlos Ruiz 1951
Elena "bright, devoted" + Carlos Ruiz "witty, loyal" -> Dave Ruiz 1979 "loyal, curious", Lucia 1984
Sarah "brave, curious" + Dave Ruiz -> Mia 2010 "sunny, artsy", Noah 2013 "playful, kind"

focus: Sarah + Dave Ruiz
`;
