import React, { useCallback, useState } from "react";
import ReactDOM from "react-dom";

type Point = {
	x: number;
	y: number;
};

type Tile = {
	checked: boolean;
	mine: boolean;
	point: Point;
	state: TileState;
	surroundingMines: number;
};

type TileState = "default" | "marked" | "question";

type Layout = Tile[][];

type MinefieldProps = {
	grid: Grid;
};

const Minefield = (props: MinefieldProps) => {
	const { grid } = props;
	const [showModal, setShowModal] = useState(true);

	const toggleState = (tile: Tile) => (event: React.MouseEvent) => {
		grid.rotateState(tile);
		event.preventDefault();
		event.stopPropagation();
	};

	const checkTile = (tile: Tile) => (event: React.MouseEvent) => {
		if (event.metaKey) {
			grid.rotateState(tile);
			return;
		}

		grid.checkLocation(tile);
	};

	const startNewGame = useCallback(() => {
		// Set this back to true so the modal will show on the next victory if it was dismissed.
		setShowModal(true);
		grid.buildLayout();
		grid.checkCorners();
		grid.render();
	}, [grid, setShowModal]);

	const setProperty = (prop: "width" | "height" | "mines") => (
		event: React.ChangeEvent<HTMLInputElement>,
	) => {
		const value = parseInt(event.target.value);
		if (value > 1) {
			grid[prop] = value;
			startNewGame();
		}
	};

	return (
		<div id="container">
			{grid.completed && showModal && (
				<div id="floating">
					<div id="modal">
						<h1 id="modal-title">
							{grid.victory
								? `You took ${(
										(grid.completed - grid.start!) /
										1000
								  ).toFixed(1)} seconds c:`
								: `You blew up a mine :c`}
						</h1>
						<button id="modal-okay" onClick={startNewGame}>
							{grid.victory ? "Yay c:" : "Aww :c"}
						</button>
						<button id="modal-close" onClick={() => setShowModal(false)}>
							See it
						</button>
					</div>
				</div>
			)}

			<table>
				<thead>
					<tr></tr>
				</thead>
				<tbody>
					{grid.layout.map((column, x) => (
						<tr key={`${x}`}>
							{column.map((tile, y) => (
								<td
									key={`${x}-${y}`}
									onClick={checkTile(tile)}
									onContextMenu={toggleState(tile)}
									className={`${tile.state} ${
										tile.checked ? "checked" : ""
									} ${tile.mine ? "mine" : ""}`}
								>
									{tile.surroundingMines || ""}
								</td>
							))}
						</tr>
					))}
					{grid.completed && !showModal && (
						<tr>
							<td colSpan={grid.width} onClick={startNewGame}>
								New game
							</td>
						</tr>
					)}
				</tbody>
			</table>

			<section id="options">
				<label>Rows</label>
				<input
					type="number"
					value={grid.width}
					min="3"
					onChange={setProperty("width")}
				/>
				<label>Columns</label>
				<input
					type="number"
					value={grid.height}
					min="3"
					onChange={setProperty("height")}
				/>
				<label>Mines</label>
				<input
					type="number"
					value={grid.mines}
					min="1"
					onChange={setProperty("mines")}
				/>
			</section>
		</div>
	);
};

class Grid {
	layout: Layout = [];
	width: number = 16;
	height: number = 30;
	mines: number = 99;

	start: number | null = null;
	completed: number | null = null;
	victory: boolean = false;

	constructor() {
		this.buildLayout();
		this.checkCorners();
	}

	buildLayout() {
		this.layout = [];

		for (let x = 0; x < this.width; x++) {
			this.layout[x] = [];

			for (let y = 0; y < this.height; y++) {
				this.layout[x][y] = {
					checked: false,
					mine: false,
					point: { x, y },
					state: "default",
					surroundingMines: 0,
				};
			}
		}

		if (this.mines > (this.width * this.height) / 2) {
			throw new Error("Board has too many mines on it!");
		}

		for (let i = 0; i < this.mines; i++) {
			const x = Math.floor(Math.random() * this.width);
			const y = Math.floor(Math.random() * this.height);

			// Try again if this is already a mine
			if (this.layout[x][y].mine) {
				i--;
				continue;
			}

			// If it's in one of the corners, try again
			if ((x === 0 || x === this.width - 1) && (y === 0 || y === this.height - 1)) {
				i--;
				continue;
			}

			this.layout[x][y].mine = true;
		}

		// Reset the timing/completion properties before returning
		this.start = Date.now();
		this.completed = null;
		this.victory = false;
	}

	tile(point: Point): Tile {
		return this.layout[point.x]?.[point.y];
	}

	neighborTiles(tile: Tile, filter: (tile: Tile) => boolean): Tile[] {
		const { x, y } = tile.point;
		const touching = [
			[x - 1, y - 1],
			[x, y - 1],
			[x + 1, y - 1],
			[x - 1, y],
			[x + 1, y],
			[x - 1, y + 1],
			[x, y + 1],
			[x + 1, y + 1],
		];

		// There might be positions in this array that don't exist
		// if the origin is on the edge of the board.
		return touching.map(([x, y]) => this.tile({ x, y })).filter(filter);
	}

	safeCheckLocation(tile: Tile) {
		if (!tile.checked) {
			this.checkLocation(tile, true);
		}
	}

	checkLocation(tile: Tile, skipRender?: boolean) {
		// If the tile is already checked and we click again, check everything around it
		// that hasn't been marked as a bomb by the player.

		if (tile.checked) {
			const neighbors = this.neighborTiles(
				tile,
				(neighbor) =>
					neighbor && !neighbor.checked && neighbor.state === "default",
			);

			neighbors.forEach((tile) => this.safeCheckLocation(tile));
			this.render();
			return;
		}

		const neighbors = this.neighborTiles(
			tile,
			(neighbor) => neighbor && (neighbor.mine || !neighbor.checked),
		);
		const surroundingMines = neighbors.filter((neighbor) => neighbor.mine).length;

		// Mark the tile as checked before we start doing anything recursive
		tile.checked = true;

		// If it's a mine, we're done
		if (tile.mine) {
			this.completed = Date.now();
			this.render();
			return;
		}
		// If there aren't any mines surrounding the file, then we can check all
		// of them automatically to save the player a few clicks
		else if (surroundingMines === 0) {
			neighbors.forEach((neighbor) => this.safeCheckLocation(neighbor));
		}
		// Show how many mines surround the tile
		else tile.surroundingMines = surroundingMines;

		// Things that should not be done from recursive calls
		if (!skipRender) {
			const mysteries = this.layout.some((column) =>
				column.some((location) => !location.checked && !location.mine),
			);

			if (!mysteries) {
				this.completed = Date.now();
				this.victory = true;
			}

			this.render();
		}
	}

	checkCorners() {
		this.safeCheckLocation(this.tile({ x: 0, y: 0 }));
		this.safeCheckLocation(this.tile({ x: 0, y: this.height - 1 }));
		this.safeCheckLocation(this.tile({ x: this.width - 1, y: 0 }));
		this.safeCheckLocation(this.tile({ x: this.width - 1, y: this.height - 1 }));
	}

	rotateState(tile: Tile) {
		if (tile.state === "default") tile.state = "marked";
		else if (tile.state === "marked") tile.state = "question";
		else if (tile.state === "question") tile.state = "default";

		this.render();
	}

	render() {
		ReactDOM.render(<Minefield grid={this} />, document.querySelector("#minefield"));
	}
}

new Grid().render();
