# CLI

- Status: Proposed

The CLI is the first public interface. It must behave the same for a person, CI
job, and coding agent. It is a thin shell over the compiler and must not own
source parsing or rule logic.

The MVP exposes only `mensor check`. Additional commands require a concrete
workflow that cannot be expressed through check output. See
`command-contract.md` for exact arguments, output, and exit status.
