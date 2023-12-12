import { useCallback, useEffect, useMemo, useState } from "react";
import "./App.css";
import { v4 as uuidv4 } from "uuid";
import {
  adjectives,
  animals,
  colors,
  names,
  uniqueNamesGenerator,
} from "unique-names-generator";

class Point {
  public id: string = uuidv4();
  public x: number;
  public y: number;

  public constructor(x: number, y: number) {
    this.x = x;
    this.y = y;
  }
}

class BroadCast<In, Out> {
  public listeners: ((data: In) => Out)[] = [];

  public addListener(listener: (data: In) => Out) {
    this.listeners.push(listener);
  }

  public broadcast(data: In) {
    this.listeners.forEach((listener) => {
      listener(data);
    });
  }

  public removeListener(listener: (data: In) => Out) {
    this.listeners = this.listeners.filter((l) => l !== listener);
  }
}

function isPointInsidePolygon(point: Point, polygon: Point[]) {
  const x = point.x;
  const y = point.y;

  let inside = false;

  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i].x;
    const yi = polygon[i].y;
    const xj = polygon[j].x;
    const yj = polygon[j].y;

    const intersect =
      yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi;

    if (intersect) {
      inside = !inside;
    }
  }

  return inside;
}

function doSetsIntersect(set1: Point[], set2: Point[]) {
  for (let point of set1) {
    if (isPointInsidePolygon(point, set2)) {
      return true; // Intersection found
    }
  }

  for (let point of set2) {
    if (isPointInsidePolygon(point, set1)) {
      return true; // Intersection found
    }
  }

  return false; // No intersection found
}

class Shape {
  public id: string = uuidv4();

  public name: string = uniqueNamesGenerator({
    dictionaries: [adjectives, colors, animals, names],
    length: 2,
  });

  public board: Board;

  public points: Point[] = [];

  public selected: boolean = false;

  private onMoveBroadcast: BroadCast<void, void> = new BroadCast();

  private onSelectedBroadcast: BroadCast<void, void> = new BroadCast();

  public constructor(board: Board, points: Point[]) {
    this.board = board;
    this.points = points;
  }

  public move(points: Point[]) {
    this.points = points;
    this.onMoveBroadcast.broadcast();
  }

  public select() {
    this.board.select(this);
    this.selected = !this.selected;
    this.onSelectedBroadcast.broadcast();
  }

  public deselect() {
    this.selected = false;
    this.onSelectedBroadcast.broadcast();
  }

  public onMove(listener: () => void) {
    this.onMoveBroadcast.addListener(listener);
  }

  public onSelected(listener: () => void) {
    this.onSelectedBroadcast.addListener(listener);
  }

  public getCenter(): Point {
    // Calculate the average of x-coordinates and y-coordinates
    const avgX =
      this.points.reduce((sum, point) => sum + point.x, 0) / this.points.length;
    const avgY =
      this.points.reduce((sum, point) => sum + point.y, 0) / this.points.length;

    // Return the center point as an array [avgX, avgY]
    return new Point(avgX, avgY);
  }

  public intersects(shape: Shape): boolean {
    return doSetsIntersect(this.points, shape.points);
  }

  public remove() {
    this.board.removeShape(this);
  }
}

class Board {
  public shapes: Shape[] = [];

  public onNewShape: BroadCast<Shape, void> = new BroadCast();
  public onShapeRemoved: BroadCast<Shape, void> = new BroadCast();

  public constructor() {
    this.shapes = [];
  }

  public select(shape: Shape) {
    this.shapes.forEach((n) => {
      if (n.id !== shape.id) {
        n.deselect();
      }
    });
  }

  public addShape(shape: Shape) {
    this.shapes.push(shape);
    this.onNewShape.broadcast(shape);
  }

  public removeShape(shape: Shape) {
    this.shapes = this.shapes.filter((s) => s.id !== shape.id);
    this.onShapeRemoved.broadcast(shape);
  }
}

type Operator = "=" | "!=" | ">" | "<" | ">=" | "<=";

type Value = number | boolean;

class Node extends Shape {
  public parent: Node | null;
  public operator: Operator | null = null;
  public value: Value | null = null;
  public children: Node[] = [];
  public lines: Line[] = [];

  public constructor(
    board: Board,
    operator: Operator | null = null,
    value: Value | null = null,
    parent: Node | null = null
  ) {
    let points: Point[] = [];

    if (parent) {
      points = parent.points.map((point) => {
        return new Point(point.x, point.y + 200);
      });
    } else {
      points = [
        new Point(0, 0),
        new Point(200, 0),
        new Point(200, 100),
        new Point(0, 100),
      ];
    }

    super(board, points);

    this.parent = parent;

    this.operator = operator;

    this.value = value;

    if (parent) {
      board.addShape(new Line(parent, this, board));
    }
  }

  public isRoot() {
    return this.parent === null;
  }

  public addChild() {
    const node = new Node(this.board, null, null, this);

    let intersectingShape = this.board.shapes
      .filter((s) => s instanceof Node)
      .find((s) => s.intersects(node));

    while (intersectingShape) {
      const intersectingShapeWidth =
        intersectingShape.points[1].x - intersectingShape.points[0].x;

      node.move(
        node.points.map((point) => {
          return new Point(point.x + intersectingShapeWidth + 10, point.y);
        })
      );

      intersectingShape = this.board.shapes
        .filter((s) => s instanceof Node)
        .find((s) => s.intersects(node));
    }
    this.board.addShape(node);
    this.children.push(node);
  }

  public remove() {
    super.remove();

    this.lines.forEach((line) => {
      line.remove();
    });

    this.children.forEach((child) => {
      child.remove();
    });
  }
}

class Line extends Shape {
  public node1: Node;
  public node2: Node;

  public constructor(node1: Node, node2: Node, board: Board) {
    super(board, calculatePointsBetween(node1, node2));

    this.node1 = node1;
    this.node2 = node2;

    node1.onMove(() => {
      this.move(calculatePointsBetween(node1, node2));
    });

    node2.onMove(() => {
      this.move(calculatePointsBetween(node1, node2));
    });

    this.node1.lines.push(this);

    this.node2.lines.push(this);
  }

  public isEndPoint(point: Point): boolean {
    return (
      this.points[this.points.length - 1].x === point.x &&
      this.points[this.points.length - 1].y === point.y
    );
  }

  public isStartPoint(point: Point): boolean {
    return this.points[0].x === point.x && this.points[0].y === point.y;
  }
}

function calculatePointsBetween(node1: Node, node2: Node): Point[] {
  const node1Center = node1.getCenter();

  const node2Center = node2.getCenter();

  const diff_X = node1Center.x - node2Center.x;

  const diff_Y = node1Center.y - node2Center.y;

  let numberOfPoints = 10;

  const interval_X = diff_X / numberOfPoints + 1;

  const interval_Y = diff_Y / numberOfPoints + 1;

  const points: Point[] = [];

  for (let i = 0; i < numberOfPoints; i++) {
    points.push(
      new Point(node1Center.x - interval_X * i, node1Center.y - interval_Y * i)
    );
  }

  return points;
}

function App() {
  const [currentBoard, setCurrentBoard] = useState<Board>();

  useEffect(() => {
    const board = new Board();
    setCurrentBoard(board);
  }, []);

  let boardComponent = <></>;

  if (currentBoard) {
    boardComponent = <BoardComponent board={currentBoard} />;
  }

  function handleJsonify() {
    const nodes = currentBoard?.shapes
      .filter((shape) => shape instanceof Node)
      .map((shape) => shape as Node);

    if (!nodes) {
      return;
    }

    const json = jsonifyNodes(nodes[0]);

    console.log(json);

    function jsonifyNodes(node: Node): any {
      if (node.children.length === 0) {
        return {
          operator: node.operator,
          id: node.id,
          value: node.value,
          name: node.name,
        };
      }

      return {
        operator: node.operator,
        id: node.id,
        value: node.value,
        children: node.children.map((child) => jsonifyNodes(child)),
        name: node.name,
      };
    }
  }

  return (
    <>
      {boardComponent}
      <div className="z-10 absolute right-2 top-2 ">
        <button
          onClick={handleJsonify}
          className="bg-gray-400 border px-8 py-3 text-white hover:bg-gray-600"
        >
          Jsonify
        </button>
      </div>
    </>
  );
}

function BoardComponent({ board }: Readonly<{ board: Board }>) {
  const [nodes, setNodes] = useState<JSX.Element[]>([]);
  const [lines, setLines] = useState<JSX.Element[]>([]);

  useEffect(() => {
    board.onNewShape.addListener((shape) => {
      if (shape instanceof Node) {
        setNodes((nodes) => [
          ...nodes,
          <NodeComponent key={shape.id} node={shape} />,
        ]);
      } else if (shape instanceof Line) {
        setLines((lines) => [
          ...lines,
          <LineComponent key={shape.id} line={shape} />,
        ]);
      }
    });

    board.onShapeRemoved.addListener((shape) => {
      if (shape instanceof Node) {
        setNodes((nodes) => nodes.filter((node) => node.key !== shape.id));
      } else if (shape instanceof Line) {
        setLines((lines) => lines.filter((line) => line.key !== shape.id));
      }
    });

    board.addShape(new Node(board));
  }, []);

  return (
    <div className="bg-gray-50 w-full h-full z-0 bg-grid relative overflow-auto">
      {nodes}
      {lines}
    </div>
  );
}

function NodeComponent({ node }: Readonly<{ node: Node }>) {
  const [x, setX] = useState(0);

  const [y, setY] = useState(0);

  const [height, setHeight] = useState(0);

  const [width, setWidth] = useState(0);

  const [selected, setSelected] = useState(false);

  const [mousePosition, setMousePosition] = useState<Point | null>(null);

  const [isLine, setIsLine] = useState(false);

  const [diffFromMouseDownForEachPoint, setDiffFromMouseDownForEachPoint] =
    useState<{ x: number; y: number }[]>([]);

  useEffect(() => {
    node.onSelected(() => {
      setSelected(node.selected);
    });

    node.onMove(() => {
      const topLeftPoint = node.points[0];

      setX(topLeftPoint.x);

      setY(topLeftPoint.y);
    });

    const topLeftPoint = node.points[0];

    setX(topLeftPoint.x);

    setY(topLeftPoint.y);

    setSelected(node.selected);

    setHeight(node.points[2].y - node.points[0].y);

    setWidth(node.points[1].x - node.points[0].x);
  }, []);

  const handleMouseMoveCallback = useCallback(
    (e: MouseEvent) => handleMouseMove(e),
    []
  );

  function handleMouseMove(e: MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    setMousePosition(new Point(e.clientX, e.clientY));
  }

  useEffect(() => {
    if (!mousePosition) {
      return;
    }

    if (diffFromMouseDownForEachPoint.length === 0) {
      throw new Error("diffFromMouseDownForEachPoint is empty");
    }

    const x = mousePosition.x;

    const y = mousePosition.y;

    const points = diffFromMouseDownForEachPoint.map((diff) => {
      return new Point(x + diff.x, y + diff.y);
    });

    node.move(points);

    if (node.parent) {
      const currentNodePoints = node.parent.points;

      const lineNodePoints = node.points;

      const topLeftOfKey = currentNodePoints[0];

      const topRightOfKey = currentNodePoints[1];

      const bottomRightToLine = lineNodePoints[2];

      const bottomLeftToLine = lineNodePoints[3];

      const isBottomRightIsLeftOfTopLeft = bottomRightToLine.x < topLeftOfKey.x;

      const isBottomRightAboveTopLeft = bottomRightToLine.y < topRightOfKey.y;

      const isLineAboveAndLeftToTopLeftOfKey =
        isBottomRightIsLeftOfTopLeft && isBottomRightAboveTopLeft;

      const isBottomLeftIsLeftOfTopRight =
        bottomLeftToLine.x <= topRightOfKey.x;

      const isBottomLeftIsAboveTopRight = bottomLeftToLine.y <= topRightOfKey.y;

      const isLineAboveAndLeftToTopRightOfKey =
        isBottomLeftIsLeftOfTopRight && isBottomLeftIsAboveTopRight;

      const isLine =
        isLineAboveAndLeftToTopLeftOfKey || isLineAboveAndLeftToTopRightOfKey;

      setIsLine(isLine);
    }
  }, [mousePosition]);

  function handleClicked(e: React.MouseEvent<HTMLDivElement, MouseEvent>) {
    e.preventDefault();
    e.stopPropagation();
    node.select();
  }

  let classes =
    " bg-white border-gray-500 border-2 p-3 cursor-pointer float-left mx-2";

  if (selected) {
    classes += " bg-blue-100 hover:bg-blue-300";
  } else {
    classes += " hover:bg-gray-100";
  }

  return (
    <div
      onKeyDown={(_) => {}}
      onMouseDown={(e) => {
        const diffFromMouseDownForEachPoint = node.points.map((point) => ({
          x: point.x - e.clientX,
          y: point.y - e.clientY,
        }));
        setDiffFromMouseDownForEachPoint(diffFromMouseDownForEachPoint);
        window.addEventListener("mousemove", handleMouseMoveCallback);
      }}
      onMouseUp={(_) => {
        window.removeEventListener("mousemove", handleMouseMoveCallback);
      }}
      className={"absolute z-10 " + (selected ? "z-50" : "")}
      style={{
        top: y,
        left: x,
      }}
    >
      <div
        onKeyDown={(_) => {}}
        onClick={(e) => handleClicked(e)}
        className={classes}
        style={{
          height: height,
          width: width,
        }}
      >
        <div>{node.isRoot() ? "Root" : ""}</div>
        <div>{node.name}</div>
        <div>{node.operator}</div>
        <div>{node.value}</div>
        <div>isLine:{JSON.stringify(isLine)}</div>
      </div>
      {selected && (
        <div className={"float-right"}>
          <button
            onClick={() => {
              node.addChild();
            }}
          >
            Add Child
          </button>
          <button
            onClick={() => {
              node.remove();
            }}
          >
            Remove
          </button>
        </div>
      )}
    </div>
  );
}

function LineComponent({ line }: Readonly<{ line: Line }>) {
  const [points, setPoints] = useState<JSX.Element[]>();

  useEffect(() => {
    line.onMove(() => {
      setPoints(
        line.points.map((point) => (
          <PointComponent key={point.id} point={point} line={line} />
        ))
      );
    });

    setPoints(
      line.points.map((point) => (
        <PointComponent key={point.id} point={point} line={line} />
      ))
    );
  }, []);

  return <>{points}</>;
}

function PointComponent({
  point,
  line,
}: Readonly<{ point: Point; line: Line }>) {
  return (
    <div
      className={"absolute"}
      style={{
        top: point.y,
        left: point.x,
      }}
    >
      <div className={"w-2 h-2 bg-gray-500 rounded-full z-0"}>
        {line.isEndPoint(point)
          ? "End"
          : line.isStartPoint(point)
          ? "Start"
          : ""}
      </div>
    </div>
  );
}

export default App;
