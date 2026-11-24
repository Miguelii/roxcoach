import type { DbTables } from '@/_bff/core/db/tables'
import type { Database } from '@/_bff/core/db/database.types'

type RoxcoachTables = Database['roxcoach']['Tables']

export type TableColumn<Table extends DbTables> = Extract<
    keyof RoxcoachTables[`${Table}`]['Row'],
    string
>

type JoinColumns<Columns extends readonly string[]> = Columns extends readonly [
    infer First extends string,
    ...infer Rest extends string[],
]
    ? Rest extends []
        ? First
        : `${First}, ${JoinColumns<Rest>}`
    : string

/**
 * Builds the column list of a `select()`. Columns are checked against the generated database
 * types, so a column that does not exist on the table is a compile error. The result keeps its
 * literal type, which postgrest-js needs to type the returned rows.
 */
export const selectColumns = <
    Table extends DbTables,
    const Columns extends readonly TableColumn<Table>[],
>(
    _table: Table,
    columns: Columns
): JoinColumns<Columns> =>
    // SAFETY: JoinColumns is the type-level form of this exact join.
    columns.join(', ') as JoinColumns<Columns>
