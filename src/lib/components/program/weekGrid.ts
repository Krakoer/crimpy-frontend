// The column template every row of the program week grid shares: the week info
// column, one column per day, then the frequency and everyday columns. The
// sticky day header, the week row headers, the day grids and the performed rows
// all lay out against it, so a cell always sits under the label naming it.
// A grid using it must emit exactly ten children or the extras wrap onto an
// implicit row.
//
// The three fixed columns share a constant width, so widening the week column
// takes from the frequency and everyday columns and leaves the day cells, where
// the sessions live, exactly as wide as they were. The week column is as wide
// as it is because it carries the phase the week is in, and a phase clipped to
// "max strength, 3 we..." on every row is a column nobody can scan.
export const WEEK_GRID_COLUMNS = '176px repeat(7, minmax(0, 1fr)) 106px 106px';
