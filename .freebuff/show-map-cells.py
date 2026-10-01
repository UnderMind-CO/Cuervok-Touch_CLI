#!/usr/bin/env python3
"""
Shows a text visualization of a Dofus Touch map to help identify
which cells have interactive elements.

Usage:
  python show-map-cells.py <mapId> [--highlight cell1,cell2,...] [--doors]

The --doors flag highlights cells that have gfx but no id in the midground
(potential door positions). The --highlight flag highlights specific cells.
"""

import json
import sys
import urllib.request

CDN_BASE = 'https://dofustouch.cdn.ankama.com/assets/3.2.12_cLlB%2C151J4Vd.fZX3eoz-xHi7Tx6Mw*3'


def fetch_map(map_id):
    url = f'{CDN_BASE}/maps/{map_id}.json'
    with urllib.request.urlopen(url, timeout=15) as resp:
        return json.loads(resp.read().decode())


def iso_to_grid(cell_id, width=14):
    """Convert a Dofus cell ID to isometric grid coordinates."""
    row = cell_id // width
    col = cell_id % width
    return row, col


def print_map(map_data, highlight_cells=None, show_doors=False):
    ml = map_data.get('midgroundLayer', {})
    cells = map_data.get('cells', [])
    width = 14  # Standard Dofus Touch map width

    # Build sets for quick lookup
    midground_with_gfx = set()
    midground_with_id = set()
    door_candidates = set()

    for ck, entries in ml.items():
        for c in entries:
            cell_id = int(ck)
            if c.get('g') is not None:
                midground_with_gfx.add(cell_id)
            if c.get('id') is not None:
                midground_with_id.add(cell_id)
                if c.get('g') is None:
                    door_candidates.add(cell_id)  # id but no gfx = potential door

    highlight = set(highlight_cells or [])

    print(f'\nMap {map_data.get("id")} - {len(cells)} cells')
    print(f'Midground cells with gfx (interactive candidates): {len(midground_with_gfx)}')
    print(f'Midground cells with id (element IDs): {len(midground_with_id)}')
    if show_doors:
        print(f'Door candidates (id, no gfx): {len(door_candidates)}')
    print()

    # Print the isometric grid
    max_rows = (len(cells) + width - 1) // width
    for row in range(max_rows):
        indent = ' ' * row  # Isometric offset
        line = indent
        for col in range(width):
            cell_id = row * width + col
            if cell_id >= len(cells):
                break

            if cell_id in highlight:
                line += f'[{cell_id:3d}]'
            elif show_doors and cell_id in door_candidates:
                line += f' D{cell_id:3d}'
            elif cell_id in midground_with_gfx:
                gfx_entries = []
                for entries in ml.get(str(cell_id), []):
                    if entries.get('g') is not None:
                        gfx_entries.append(str(entries['g']))
                line += f' G{cell_id:3d}'
            else:
                losmov = cells[cell_id].get('l', 0)
                walkable = (losmov & 1) == 1
                line += '   . ' if walkable else '   # '

        print(line)

    # Legend
    print()
    print('Legend:')
    print('  [NNN] = Highlighted cell')
    print('  GNNN  = Cell with gfx (potential interactive)')
    if show_doors:
        print('  DNNN  = Door candidate (id, no gfx)')
    print('   .    = Walkable cell')
    print('   #    = Non-walkable cell')
    print()


def main():
    if len(sys.argv) < 2:
        print(__doc__)
        return

    map_id = int(sys.argv[1])
    highlight = []
    show_doors = False

    for arg in sys.argv[2:]:
        if arg == '--doors':
            show_doors = True
        elif arg.startswith('--highlight'):
            idx = sys.argv.index(arg)
            if '=' in arg:
                highlight = [int(x) for x in arg.split('=')[1].split(',')]
            elif idx + 1 < len(sys.argv):
                highlight = [int(x) for x in sys.argv[idx + 1].split(',')]

    map_data = fetch_map(map_id)
    print_map(map_data, highlight, show_doors)


if __name__ == '__main__':
    main()
