import React, { useState } from 'react';
import { Language } from '../../types/index.ts';
import { Trophy, RotateCcw, Swords, Sparkles, Shield, Cpu } from 'lucide-react';

type PieceType = 'p' | 'n' | 'b' | 'r' | 'q' | 'k';
type PieceColor = 'w' | 'b';

interface ChessPiece {
  type: PieceType;
  color: PieceColor;
}

interface SpaceChessProps {
  lang: Language;
}

export const SpaceChess: React.FC<SpaceChessProps> = ({ lang }) => {
  // Initial Chess Board Setup
  const createInitialBoard = (): (ChessPiece | null)[][] => {
    const b: (ChessPiece | null)[][] = Array(8).fill(null).map(() => Array(8).fill(null));
    const backRow: PieceType[] = ['r', 'n', 'b', 'q', 'k', 'b', 'n', 'r'];

    // Black back row & pawns
    for (let c = 0; c < 8; c++) {
      b[0][c] = { type: backRow[c], color: 'b' };
      b[1][c] = { type: 'p', color: 'b' };
    }

    // White back row & pawns
    for (let c = 0; c < 8; c++) {
      b[6][c] = { type: 'p', color: 'w' };
      b[7][c] = { type: backRow[c], color: 'w' };
    }

    return b;
  };

  const [board, setBoard] = useState<(ChessPiece | null)[][]>(createInitialBoard);
  const [selectedSquare, setSelectedSquare] = useState<[number, number] | null>(null);
  const [validMoves, setValidMoves] = useState<[number, number][]>([]);
  const [turn, setTurn] = useState<PieceColor>('w');
  const [capturedWhite, setCapturedWhite] = useState<PieceType[]>([]);
  const [capturedBlack, setCapturedBlack] = useState<PieceType[]>([]);
  const [winner, setWinner] = useState<string | null>(null);
  const [moveCount, setMoveCount] = useState(0);

  // Unicode Chess Symbols
  const symbols: Record<PieceColor, Record<PieceType, string>> = {
    w: { k: '♔', q: '♕', r: '♖', b: '♗', n: '♘', p: '♙' },
    b: { k: '♚', q: '♛', r: '♜', b: '♝', n: '♞', p: '♟' }
  };

  // Basic move generator
  const getPossibleMoves = (r: number, c: number, b: (ChessPiece | null)[][]): [number, number][] => {
    const piece = b[r][c];
    if (!piece) return [];
    const moves: [number, number][] = [];
    const color = piece.color;
    const opponent = color === 'w' ? 'b' : 'w';

    const addIfValid = (nr: number, nc: number): boolean => {
      if (nr < 0 || nr >= 8 || nc < 0 || nc >= 8) return false;
      const target = b[nr][nc];
      if (!target) {
        moves.push([nr, nc]);
        return true;
      }
      if (target.color === opponent) {
        moves.push([nr, nc]);
      }
      return false; // hit piece, stop ray
    };

    if (piece.type === 'p') {
      const dir = color === 'w' ? -1 : 1;
      const startRow = color === 'w' ? 6 : 1;
      // 1 square forward
      if (r + dir >= 0 && r + dir < 8 && !b[r + dir][c]) {
        moves.push([r + dir, c]);
        // 2 squares forward from start
        if (r === startRow && !b[r + 2 * dir][c]) {
          moves.push([r + 2 * dir, c]);
        }
      }
      // Diagonal capture
      [-1, 1].forEach(dc => {
        const nr = r + dir;
        const nc = c + dc;
        if (nr >= 0 && nr < 8 && nc >= 0 && nc < 8 && b[nr][nc]?.color === opponent) {
          moves.push([nr, nc]);
        }
      });
    } else if (piece.type === 'n') {
      const knightOffsets = [
        [-2, -1], [-2, 1], [-1, -2], [-1, 2],
        [1, -2], [1, 2], [2, -1], [2, 1]
      ];
      knightOffsets.forEach(([dr, dc]) => addIfValid(r + dr, c + dc));
    } else if (piece.type === 'b') {
      const rayDirs = [[-1, -1], [-1, 1], [1, -1], [1, 1]];
      rayDirs.forEach(([dr, dc]) => {
        let step = 1;
        while (addIfValid(r + dr * step, c + dc * step)) step++;
      });
    } else if (piece.type === 'r') {
      const rayDirs = [[-1, 0], [1, 0], [0, -1], [0, 1]];
      rayDirs.forEach(([dr, dc]) => {
        let step = 1;
        while (addIfValid(r + dr * step, c + dc * step)) step++;
      });
    } else if (piece.type === 'q') {
      const rayDirs = [
        [-1, -1], [-1, 1], [1, -1], [1, 1],
        [-1, 0], [1, 0], [0, -1], [0, 1]
      ];
      rayDirs.forEach(([dr, dc]) => {
        let step = 1;
        while (addIfValid(r + dr * step, c + dc * step)) step++;
      });
    } else if (piece.type === 'k') {
      for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
          if (dr === 0 && dc === 0) continue;
          addIfValid(r + dr, c + dc);
        }
      }
    }

    return moves;
  };

  const handleSquareClick = (r: number, c: number) => {
    if (winner || turn !== 'w') return;

    // If already selected and clicking a valid move
    if (selectedSquare) {
      const [fromR, fromC] = selectedSquare;
      const isValid = validMoves.some(([vr, vc]) => vr === r && vc === c);

      if (isValid) {
        // Execute Player Move
        executeMove(fromR, fromC, r, c);
        setSelectedSquare(null);
        setValidMoves([]);
        return;
      }
    }

    // Select piece
    const piece = board[r][c];
    if (piece && piece.color === 'w') {
      setSelectedSquare([r, c]);
      setValidMoves(getPossibleMoves(r, c, board));
    } else {
      setSelectedSquare(null);
      setValidMoves([]);
    }
  };

  const executeMove = (fromR: number, fromC: number, toR: number, toC: number) => {
    const newBoard = board.map(row => [...row]);
    const piece = newBoard[fromR][fromC];
    const target = newBoard[toR][toC];

    if (!piece) return;

    // Capture handling
    if (target) {
      if (target.color === 'w') setCapturedWhite(prev => [...prev, target.type]);
      else setCapturedBlack(prev => [...prev, target.type]);

      if (target.type === 'k') {
        setWinner(piece.color === 'w' ? 'White (Player)' : 'Black (Earth AI)');
      }
    }

    // Pawn Promotion to Queen
    if (piece.type === 'p' && (toR === 0 || toR === 7)) {
      piece.type = 'q';
    }

    newBoard[toR][toC] = piece;
    newBoard[fromR][fromC] = null;
    setBoard(newBoard);
    setMoveCount(m => m + 1);

    const nextTurn = piece.color === 'w' ? 'b' : 'w';
    setTurn(nextTurn);

    // AI Counter-move
    if (nextTurn === 'b' && !winner && target?.type !== 'k') {
      setTimeout(() => {
        makeAIMove(newBoard);
      }, 500);
    }
  };

  // Simple heuristic AI
  const makeAIMove = (currentBoard: (ChessPiece | null)[][]) => {
    const allBlackMoves: { from: [number, number]; to: [number, number]; weight: number }[] = [];

    const pieceValues: Record<PieceType, number> = {
      p: 10,
      n: 30,
      b: 30,
      r: 50,
      q: 90,
      k: 1000
    };

    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        if (currentBoard[r][c]?.color === 'b') {
          const moves = getPossibleMoves(r, c, currentBoard);
          for (const [tr, tc] of moves) {
            let weight = 0;
            const target = currentBoard[tr][tc];
            if (target) {
              weight += pieceValues[target.type] * 3; // high priority capture
            }
            // Control center board
            if (tr >= 3 && tr <= 4 && tc >= 3 && tc <= 4) {
              weight += 3;
            }
            // slight random noise for variety
            weight += Math.random() * 2;
            allBlackMoves.push({ from: [r, c], to: [tr, tc], weight });
          }
        }
      }
    }

    if (allBlackMoves.length === 0) {
      setWinner('White (Stalemate / Win)');
      return;
    }

    // Pick move with highest heuristic weight
    allBlackMoves.sort((a, b) => b.weight - a.weight);
    const chosen = allBlackMoves[0];

    const newBoard = currentBoard.map(row => [...row]);
    const piece = newBoard[chosen.from[0]][chosen.from[1]];
    const target = newBoard[chosen.to[0]][chosen.to[1]];

    if (piece) {
      if (target) {
        setCapturedWhite(prev => [...prev, target.type]);
        if (target.type === 'k') {
          setWinner('Black (Earth AI)');
        }
      }

      if (piece.type === 'p' && chosen.to[0] === 7) {
        piece.type = 'q';
      }

      newBoard[chosen.to[0]][chosen.to[1]] = piece;
      newBoard[chosen.from[0]][chosen.from[1]] = null;
      setBoard(newBoard);
      setTurn('w');
    }
  };

  const resetGame = () => {
    setBoard(createInitialBoard());
    setSelectedSquare(null);
    setValidMoves([]);
    setTurn('w');
    setCapturedWhite([]);
    setCapturedBlack([]);
    setWinner(null);
    setMoveCount(0);
  };

  return (
    <div className="w-full rounded-3xl overflow-hidden bg-slate-950 border border-slate-800 shadow-2xl p-6 flex flex-col space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-4 border-b border-slate-800">
        <div>
          <div className="flex items-center space-x-2 text-xs font-mono text-cyan-400">
            <Cpu className="w-4 h-4" />
            <span>DEEP SPACE STRATEGIC CHESS ARENA</span>
          </div>
          <h2 className="text-xl font-bold text-white mt-1">Cosmic Grandmaster Chess</h2>
          <p className="text-xs text-slate-400">
            Compete against Earth One AI neural evaluation engine.
          </p>
        </div>

        <div className="flex items-center space-x-3">
          <div className="flex items-center space-x-2 px-3 py-1.5 rounded-xl bg-slate-900 border border-slate-800 text-xs font-mono">
            <span className="text-slate-400">TURN:</span>
            <span className={`font-bold ${turn === 'w' ? 'text-cyan-400' : 'text-purple-400'}`}>
              {turn === 'w' ? 'White (You)' : 'Black (AI Thinking...)'}
            </span>
          </div>

          <button
            onClick={resetGame}
            className="flex items-center space-x-1.5 px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium cursor-pointer transition-colors"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Reset</span>
          </button>
        </div>
      </div>

      {/* Winner Banner */}
      {winner && (
        <div className="p-4 rounded-2xl bg-cyan-950/80 border border-cyan-500/50 text-cyan-200 flex items-center space-x-3 text-sm">
          <Trophy className="w-5 h-5 text-amber-400 shrink-0" />
          <span className="font-bold">Victory Announcement: {winner} won the cosmic match!</span>
        </div>
      )}

      {/* Center Layout: Board & Side info */}
      <div className="flex flex-col lg:flex-row items-center justify-center gap-8">
        {/* Captured Tray: Black pieces captured by White */}
        <div className="flex lg:flex-col items-center gap-1.5 p-3 rounded-2xl bg-slate-900/60 border border-slate-800/80 min-w-[70px]">
          <span className="text-[10px] text-slate-400 font-mono">Captured</span>
          <div className="flex lg:flex-col flex-wrap gap-1 text-lg text-slate-300">
            {capturedBlack.map((p, idx) => (
              <span key={idx}>{symbols.b[p]}</span>
            ))}
          </div>
        </div>

        {/* 8x8 Chess Board */}
        <div className="p-3 sm:p-4 rounded-3xl bg-[#0f172a] border-4 border-slate-800 shadow-2xl">
          <div className="grid grid-cols-8 gap-0 border border-slate-700/60 rounded-xl overflow-hidden">
            {board.map((row, r) =>
              row.map((cell, c) => {
                const isBlackSquare = (r + c) % 2 === 1;
                const isSelected = selectedSquare && selectedSquare[0] === r && selectedSquare[1] === c;
                const isValidMove = validMoves.some(([vr, vc]) => vr === r && vc === c);

                let bgClass = isBlackSquare ? 'bg-[#1e293b]' : 'bg-[#334155]';
                if (isSelected) bgClass = 'bg-cyan-600/80 ring-2 ring-cyan-300 z-10';
                else if (isValidMove) bgClass = isBlackSquare ? 'bg-cyan-950/80' : 'bg-cyan-900/80';

                return (
                  <button
                    key={`${r}-${c}`}
                    onClick={() => handleSquareClick(r, c)}
                    className={`relative w-10 h-10 sm:w-14 sm:h-14 flex items-center justify-center text-2xl sm:text-3xl select-none cursor-pointer transition-colors ${bgClass}`}
                  >
                    {/* Valid Move Dot / Ring */}
                    {isValidMove && !cell && (
                      <div className="w-3 h-3 rounded-full bg-cyan-400/80 shadow-md shadow-cyan-400" />
                    )}
                    {isValidMove && cell && (
                      <div className="absolute inset-1 rounded-lg border-2 border-rose-500 animate-pulse pointer-events-none" />
                    )}

                    {/* Piece Display */}
                    {cell && (
                      <span
                        className={`transition-transform hover:scale-110 drop-shadow-md ${
                          cell.color === 'w' ? 'text-white font-serif' : 'text-purple-300 font-serif'
                        }`}
                      >
                        {symbols[cell.color][cell.type]}
                      </span>
                    )}
                  </button>
                );
              })
            )}
          </div>
        </div>

        {/* Captured Tray: White pieces captured by Black */}
        <div className="flex lg:flex-col items-center gap-1.5 p-3 rounded-2xl bg-slate-900/60 border border-slate-800/80 min-w-[70px]">
          <span className="text-[10px] text-slate-400 font-mono">Lost</span>
          <div className="flex lg:flex-col flex-wrap gap-1 text-lg text-slate-400">
            {capturedWhite.map((p, idx) => (
              <span key={idx}>{symbols.w[p]}</span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
