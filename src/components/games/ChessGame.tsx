import React, { useState } from 'react';
import { soundSynth } from './soundSynth.ts';
import {
  RotateCcw,
  Trophy,
  Swords,
  ChevronRight,
  Shield,
  Sparkles,
  Users
} from 'lucide-react';

type PieceType = 'p' | 'r' | 'n' | 'b' | 'q' | 'k';
type PieceColor = 'w' | 'b';

interface ChessPiece {
  type: PieceType;
  color: PieceColor;
}

type BoardState = (ChessPiece | null)[][];

const INITIAL_BOARD: BoardState = [
  [
    { type: 'r', color: 'b' },
    { type: 'n', color: 'b' },
    { type: 'b', color: 'b' },
    { type: 'q', color: 'b' },
    { type: 'k', color: 'b' },
    { type: 'b', color: 'b' },
    { type: 'n', color: 'b' },
    { type: 'r', color: 'b' }
  ],
  [
    { type: 'p', color: 'b' },
    { type: 'p', color: 'b' },
    { type: 'p', color: 'b' },
    { type: 'p', color: 'b' },
    { type: 'p', color: 'b' },
    { type: 'p', color: 'b' },
    { type: 'p', color: 'b' },
    { type: 'p', color: 'b' }
  ],
  [null, null, null, null, null, null, null, null],
  [null, null, null, null, null, null, null, null],
  [null, null, null, null, null, null, null, null],
  [null, null, null, null, null, null, null, null],
  [
    { type: 'p', color: 'w' },
    { type: 'p', color: 'w' },
    { type: 'p', color: 'w' },
    { type: 'p', color: 'w' },
    { type: 'p', color: 'w' },
    { type: 'p', color: 'w' },
    { type: 'p', color: 'w' },
    { type: 'p', color: 'w' }
  ],
  [
    { type: 'r', color: 'w' },
    { type: 'n', color: 'w' },
    { type: 'b', color: 'w' },
    { type: 'q', color: 'w' },
    { type: 'k', color: 'w' },
    { type: 'b', color: 'w' },
    { type: 'n', color: 'w' },
    { type: 'r', color: 'w' }
  ]
];

const PIECE_SYMBOLS: Record<PieceColor, Record<PieceType, string>> = {
  w: {
    k: '♔',
    q: '♕',
    r: '♖',
    b: '♗',
    n: '♘',
    p: '♙'
  },
  b: {
    k: '♚',
    q: '♛',
    r: '♜',
    b: '♝',
    n: '♞',
    p: '♟'
  }
};

const PIECE_VALUES: Record<PieceType, number> = {
  p: 100,
  n: 320,
  b: 330,
  r: 500,
  q: 900,
  k: 20000
};

export const ChessGame: React.FC<{ lang?: string }> = () => {
  const [board, setBoard] = useState<BoardState>(INITIAL_BOARD);
  const [selectedPos, setSelectedPos] = useState<{ r: number; c: number } | null>(null);
  const [validMoves, setValidMoves] = useState<{ r: number; c: number }[]>([]);
  const [turn, setTurn] = useState<PieceColor>('w');
  const [capturedWhite, setCapturedWhite] = useState<ChessPiece[]>([]);
  const [capturedBlack, setCapturedBlack] = useState<ChessPiece[]>([]);
  const [statusMessage, setStatusMessage] = useState<string>('Your move (White)');
  const [gameEnded, setGameEnded] = useState<boolean>(false);
  const [history, setHistory] = useState<{ board: BoardState; turn: PieceColor; capturedW: ChessPiece[]; capturedB: ChessPiece[] }[]>([]);

  // Compute legal moves for a piece at (r, c)
  const getMovesForPiece = (b: BoardState, r: number, c: number): { r: number; c: number }[] => {
    const piece = b[r][c];
    if (!piece) return [];
    const color = piece.color;
    const moves: { r: number; c: number }[] = [];

    const isInside = (nr: number, nc: number) => nr >= 0 && nr < 8 && nc >= 0 && nc < 8;

    if (piece.type === 'p') {
      const dir = color === 'w' ? -1 : 1;
      const startRank = color === 'w' ? 6 : 1;
      // Single push
      if (isInside(r + dir, c) && !b[r + dir][c]) {
        moves.push({ r: r + dir, c });
        // Double push from start rank
        if (r === startRank && !b[r + 2 * dir][c]) {
          moves.push({ r: r + 2 * dir, c });
        }
      }
      // Diagonal captures
      for (const dc of [-1, 1]) {
        const nr = r + dir;
        const nc = c + dc;
        if (isInside(nr, nc) && b[nr][nc] && b[nr][nc]?.color !== color) {
          moves.push({ r: nr, c: nc });
        }
      }
    } else if (piece.type === 'n') {
      const knightOffsets = [
        [-2, -1], [-2, 1], [-1, -2], [-1, 2],
        [1, -2], [1, 2], [2, -1], [2, 1]
      ];
      for (const [dr, dc] of knightOffsets) {
        const nr = r + dr;
        const nc = c + dc;
        if (isInside(nr, nc) && (!b[nr][nc] || b[nr][nc]?.color !== color)) {
          moves.push({ r: nr, c: nc });
        }
      }
    } else if (piece.type === 'b' || piece.type === 'r' || piece.type === 'q') {
      const directions: [number, number][] = [];
      if (piece.type === 'b' || piece.type === 'q') {
        directions.push([-1, -1], [-1, 1], [1, -1], [1, 1]);
      }
      if (piece.type === 'r' || piece.type === 'q') {
        directions.push([-1, 0], [1, 0], [0, -1], [0, 1]);
      }

      for (const [dr, dc] of directions) {
        let nr = r + dr;
        let nc = c + dc;
        while (isInside(nr, nc)) {
          if (!b[nr][nc]) {
            moves.push({ r: nr, c: nc });
          } else {
            if (b[nr][nc]?.color !== color) {
              moves.push({ r: nr, c: nc });
            }
            break;
          }
          nr += dr;
          nc += dc;
        }
      }
    } else if (piece.type === 'k') {
      for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
          if (dr === 0 && dc === 0) continue;
          const nr = r + dr;
          const nc = c + dc;
          if (isInside(nr, nc) && (!b[nr][nc] || b[nr][nc]?.color !== color)) {
            moves.push({ r: nr, c: nc });
          }
        }
      }
    }

    return moves;
  };

  const handleSquareClick = (r: number, c: number) => {
    if (gameEnded || turn !== 'w') return;

    // If square has a valid move, execute move
    if (selectedPos && validMoves.some(m => m.r === r && m.c === c)) {
      executeMove(selectedPos.r, selectedPos.c, r, c);
      return;
    }

    // Otherwise, select piece if it's White
    const piece = board[r][c];
    if (piece && piece.color === 'w') {
      setSelectedPos({ r, c });
      setValidMoves(getMovesForPiece(board, r, c));
    } else {
      setSelectedPos(null);
      setValidMoves([]);
    }
  };

  const executeMove = (fromR: number, fromC: number, toR: number, toC: number) => {
    const piece = board[fromR][fromC];
    if (!piece) return;

    soundSynth.playPieceClick();

    // Save history
    setHistory(h => [
      ...h,
      {
        board: board.map(row => [...row]),
        turn,
        capturedW: [...capturedWhite],
        capturedB: [...capturedBlack]
      }
    ]);

    const newBoard = board.map(row => [...row]);
    const target = newBoard[toR][toC];

    // Pawn promotion to Queen
    let movedPiece = piece;
    if (piece.type === 'p' && (toR === 0 || toR === 7)) {
      movedPiece = { type: 'q', color: piece.color };
    }

    newBoard[toR][toC] = movedPiece;
    newBoard[fromR][fromC] = null;

    if (target) {
      if (target.color === 'w') setCapturedWhite(prev => [...prev, target]);
      else setCapturedBlack(prev => [...prev, target]);

      if (target.type === 'k') {
        soundSynth.playVictory();
        setGameEnded(true);
        setStatusMessage(piece.color === 'w' ? 'Checkmate! You win!' : 'AI Grandmaster wins!');
        setBoard(newBoard);
        setSelectedPos(null);
        setValidMoves([]);
        return;
      }
    }

    setBoard(newBoard);
    setSelectedPos(null);
    setValidMoves([]);

    if (turn === 'w') {
      setTurn('b');
      setStatusMessage('AI analyzing tactical move...');

      // AI Response with 500ms delay
      setTimeout(() => {
        executeAIMove(newBoard);
      }, 500);
    }
  };

  const executeAIMove = (currentBoard: BoardState) => {
    // Collect all legal black moves
    const allMoves: { from: { r: number; c: number }; to: { r: number; c: number }; score: number }[] = [];

    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        const piece = currentBoard[r][c];
        if (piece && piece.color === 'b') {
          const moves = getMovesForPiece(currentBoard, r, c);
          for (const m of moves) {
            let score = 0;
            const target = currentBoard[m.r][m.c];
            if (target) {
              score += PIECE_VALUES[target.type] * 10;
            }
            // Prefer central advancement
            const centerDist = Math.abs(m.r - 3.5) + Math.abs(m.c - 3.5);
            score -= centerDist * 3;

            allMoves.push({ from: { r, c }, to: m, score });
          }
        }
      }
    }

    if (allMoves.length === 0) {
      setGameEnded(true);
      setStatusMessage('Stalemate! No legal moves remain.');
      return;
    }

    // Sort by best heuristic score with slight random jitter for variety
    allMoves.sort((a, b) => b.score + Math.random() * 8 - (a.score + Math.random() * 8));
    const bestMove = allMoves[0];

    const newBoard = currentBoard.map(row => [...row]);
    const piece = newBoard[bestMove.from.r][bestMove.from.c]!;
    const target = newBoard[bestMove.to.r][bestMove.to.c];

    soundSynth.playPieceClick();

    let movedPiece = piece;
    if (piece.type === 'p' && bestMove.to.r === 7) {
      movedPiece = { type: 'q', color: 'b' };
    }

    newBoard[bestMove.to.r][bestMove.to.c] = movedPiece;
    newBoard[bestMove.from.r][bestMove.from.c] = null;

    if (target) {
      if (target.color === 'w') setCapturedWhite(prev => [...prev, target]);
      else setCapturedBlack(prev => [...prev, target]);

      if (target.type === 'k') {
        soundSynth.playExplosion();
        setGameEnded(true);
        setStatusMessage('AI captured King! Match over.');
        setBoard(newBoard);
        return;
      }
    }

    setBoard(newBoard);
    setTurn('w');
    setStatusMessage('Your turn (White)');
  };

  const handleUndo = () => {
    if (history.length === 0 || gameEnded) return;
    const prev = history[history.length - 1];
    setBoard(prev.board);
    setTurn(prev.turn);
    setCapturedWhite(prev.capturedW);
    setCapturedBlack(prev.capturedB);
    setHistory(h => h.slice(0, -1));
    setSelectedPos(null);
    setValidMoves([]);
    setStatusMessage('Move undone. Your turn (White)');
  };

  const handleReset = () => {
    setBoard(INITIAL_BOARD);
    setSelectedPos(null);
    setValidMoves([]);
    setTurn('w');
    setCapturedWhite([]);
    setCapturedBlack([]);
    setStatusMessage('New match begun. Your turn (White)');
    setGameEnded(false);
    setHistory([]);
  };

  return (
    <div className="w-full max-w-2xl mx-auto flex flex-col items-center space-y-4">
      {/* Header Info */}
      <div className="w-full flex items-center justify-between p-3.5 rounded-2xl bg-slate-900/90 border border-slate-800 text-xs shadow-lg">
        <div className="flex items-center space-x-3">
          <div className="flex items-center space-x-1.5 text-cyan-400 font-mono font-bold">
            <Swords className="w-4 h-4" />
            <span>GALACTIC CHESS</span>
          </div>
          <span className="text-slate-500">|</span>
          <span className="text-slate-300 font-medium">{statusMessage}</span>
        </div>

        <div className="flex items-center space-x-2">
          <button
            onClick={handleUndo}
            disabled={history.length === 0 || gameEnded}
            className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-slate-300 text-xs font-medium cursor-pointer transition-colors"
          >
            Undo
          </button>
          <button
            onClick={handleReset}
            className="flex items-center space-x-1 px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium cursor-pointer transition-colors"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Reset</span>
          </button>
        </div>
      </div>

      {/* Captured AI Pieces (Black) */}
      <div className="w-full flex items-center justify-between px-3 py-1.5 rounded-xl bg-slate-950/60 border border-slate-800 text-xs min-h-[36px]">
        <span className="text-[11px] text-slate-400">AI Captured:</span>
        <div className="flex items-center space-x-1 text-base text-slate-200">
          {capturedBlack.map((p, idx) => (
            <span key={idx}>{PIECE_SYMBOLS.b[p.type]}</span>
          ))}
        </div>
      </div>

      {/* 8x8 Chess Board */}
      <div className="p-3 sm:p-4 rounded-3xl bg-slate-900 border-4 border-slate-800 shadow-2xl">
        <div
          className="grid grid-cols-8 grid-rows-8 border-2 border-slate-700 shadow-inner"
          style={{ width: 'min(420px, 85vw)', height: 'min(420px, 85vw)' }}
        >
          {board.map((row, r) =>
            row.map((piece, c) => {
              const isDark = (r + c) % 2 === 1;
              const isSelected = selectedPos?.r === r && selectedPos?.c === c;
              const isValidMove = validMoves.some(m => m.r === r && m.c === c);

              let bg = isDark ? 'bg-slate-800' : 'bg-slate-700/60';
              if (isSelected) bg = 'bg-cyan-600/80 ring-2 ring-cyan-300';
              else if (isValidMove) bg = isDark ? 'bg-emerald-900/60' : 'bg-emerald-800/50';

              return (
                <div
                  key={`${r}-${c}`}
                  onClick={() => handleSquareClick(r, c)}
                  className={`relative flex items-center justify-center cursor-pointer select-none transition-colors ${bg} hover:brightness-110`}
                >
                  {/* Valid move target dot */}
                  {isValidMove && !piece && (
                    <div className="w-3 h-3 rounded-full bg-emerald-400/70 shadow-sm" />
                  )}

                  {/* Piece */}
                  {piece && (
                    <span
                      className={`text-2xl sm:text-3xl leading-none font-serif ${
                        piece.color === 'w'
                          ? 'text-white drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)]'
                          : 'text-amber-500 drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)]'
                      }`}
                    >
                      {PIECE_SYMBOLS[piece.color][piece.type]}
                    </span>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Captured Player Pieces (White) */}
      <div className="w-full flex items-center justify-between px-3 py-1.5 rounded-xl bg-slate-950/60 border border-slate-800 text-xs min-h-[36px]">
        <span className="text-[11px] text-slate-400">Player Captured:</span>
        <div className="flex items-center space-x-1 text-base text-slate-200">
          {capturedWhite.map((p, idx) => (
            <span key={idx}>{PIECE_SYMBOLS.w[p.type]}</span>
          ))}
        </div>
      </div>
    </div>
  );
};
