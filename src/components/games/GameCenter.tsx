import React, { useState } from 'react';
import { Language, User } from '../../types/index.ts';
import { translations } from '../../i18n/translations.ts';
import {
  Gamepad2,
  Trophy,
  Users,
  RotateCcw,
  Sparkles,
  Award,
  Swords,
  Globe,
  CheckCircle2,
  HelpCircle
} from 'lucide-react';

interface GameCenterProps {
  currentUser: User | null;
  lang: Language;
}

export const GameCenter: React.FC<GameCenterProps> = ({ currentUser, lang }) => {
  const t = translations[lang];

  const [activeGame, setActiveGame] = useState<'gomoku' | 'trivia' | 'chess'>('gomoku');

  // -------------------------------------------------------------
  // 1. GOMOKU (Five-in-a-Row) Interactive Game State
  // -------------------------------------------------------------
  const BOARD_SIZE = 13;
  const [board, setBoard] = useState<(null | 'black' | 'white')[][]>(() =>
    Array(BOARD_SIZE).fill(null).map(() => Array(BOARD_SIZE).fill(null))
  );
  const [currentTurn, setCurrentTurn] = useState<'black' | 'white'>('black');
  const [winner, setWinner] = useState<null | 'black' | 'white' | 'draw'>(null);
  const [score, setScore] = useState({ player: 0, ai: 0 });

  const checkFiveInARow = (grid: (null | 'black' | 'white')[][], r: number, c: number, player: 'black' | 'white'): boolean => {
    const directions = [
      [ [0, 1], [0, -1] ],   // horizontal
      [ [1, 0], [-1, 0] ],   // vertical
      [ [1, 1], [-1, -1] ],  // diagonal \
      [ [1, -1], [-1, 1] ]   // diagonal /
    ];

    for (const [d1, d2] of directions) {
      let count = 1;
      // direction 1
      let nr = r + d1[0];
      let nc = c + d1[1];
      while (nr >= 0 && nr < BOARD_SIZE && nc >= 0 && nc < BOARD_SIZE && grid[nr][nc] === player) {
        count++;
        nr += d1[0];
        nc += d1[1];
      }
      // direction 2
      nr = r + d2[0];
      nc = c + d2[1];
      while (nr >= 0 && nr < BOARD_SIZE && nc >= 0 && nc < BOARD_SIZE && grid[nr][nc] === player) {
        count++;
        nr += d2[0];
        nc += d2[1];
      }
      if (count >= 5) return true;
    }
    return false;
  };

  const handleCellClick = (r: number, c: number) => {
    if (board[r][c] || winner || currentTurn !== 'black') return;

    // Player move (Black)
    const newBoard = board.map(row => [...row]);
    newBoard[r][c] = 'black';
    setBoard(newBoard);

    if (checkFiveInARow(newBoard, r, c, 'black')) {
      setWinner('black');
      setScore(s => ({ ...s, player: s.player + 1 }));
      return;
    }

    setCurrentTurn('white');

    // AI Counter-move (White) after 400ms delay
    setTimeout(() => {
      // Find open spots near center or recent moves
      let bestR = -1;
      let bestC = -1;
      let maxLocalScore = -1;

      for (let i = 0; i < BOARD_SIZE; i++) {
        for (let j = 0; j < BOARD_SIZE; j++) {
          if (!newBoard[i][j]) {
            // Priority: proximity to center + neighbors
            let neighborCount = 0;
            for (let di = -1; di <= 1; di++) {
              for (let dj = -1; dj <= 1; dj++) {
                const ni = i + di;
                const nj = j + dj;
                if (ni >= 0 && ni < BOARD_SIZE && nj >= 0 && nj < BOARD_SIZE && newBoard[ni][nj]) {
                  neighborCount += newBoard[ni][nj] === 'black' ? 2 : 1;
                }
              }
            }
            const centerDist = Math.abs(i - 6) + Math.abs(j - 6);
            const localScore = neighborCount * 5 - centerDist;
            if (localScore > maxLocalScore) {
              maxLocalScore = localScore;
              bestR = i;
              bestC = j;
            }
          }
        }
      }

      if (bestR !== -1) {
        newBoard[bestR][bestC] = 'white';
        setBoard([...newBoard]);
        if (checkFiveInARow(newBoard, bestR, bestC, 'white')) {
          setWinner('white');
          setScore(s => ({ ...s, ai: s.ai + 1 }));
        } else {
          setCurrentTurn('black');
        }
      }
    }, 400);
  };

  const resetGomoku = () => {
    setBoard(Array(BOARD_SIZE).fill(null).map(() => Array(BOARD_SIZE).fill(null)));
    setCurrentTurn('black');
    setWinner(null);
  };

  // -------------------------------------------------------------
  // 2. GLOBAL TRIVIA QUIZ STATE
  // -------------------------------------------------------------
  const triviaQuestions = [
    {
      q: 'Which ancient city in Jordan is famous for its rock-cut architecture carved from rose-red sandstone cliffs?',
      options: ['Petra', 'Jerash', 'Amman', 'Aqaba'],
      answer: 0,
      country: 'Jordan'
    },
    {
      q: 'Which space telescope situated at Sun-Earth L2 captured the deepest infrared image of the cosmos in history?',
      options: ['Hubble', 'James Webb Space Telescope', 'Kepler', 'Spitzer'],
      answer: 1,
      country: 'Global'
    },
    {
      q: 'Which traditional Chinese architectural interlocking bracket system provides immense earthquake resistance without nails?',
      options: ['Dougong (斗栱)', 'Fengshui', 'Siheyuan', 'Pagoda'],
      answer: 0,
      country: 'China'
    },
    {
      q: 'What is the name of the astronomical overview effect experienced by space travelers seeing Earth with no borders?',
      options: ['The Pale Blue Dot', 'The Overview Effect', 'The Orbital Shift', 'The Biosphere Mirror'],
      answer: 1,
      country: 'Global'
    }
  ];

  const [currentTriviaIndex, setCurrentTriviaIndex] = useState(0);
  const [selectedTriviaOption, setSelectedTriviaOption] = useState<number | null>(null);
  const [triviaScore, setTriviaScore] = useState(0);
  const [showTriviaResult, setShowTriviaResult] = useState(false);

  const handleTriviaAnswer = (optionIdx: number) => {
    if (selectedTriviaOption !== null) return;
    setSelectedTriviaOption(optionIdx);
    if (optionIdx === triviaQuestions[currentTriviaIndex].answer) {
      setTriviaScore(s => s + 100);
    }
  };

  const nextTrivia = () => {
    if (currentTriviaIndex < triviaQuestions.length - 1) {
      setCurrentTriviaIndex(i => i + 1);
      setSelectedTriviaOption(null);
    } else {
      setShowTriviaResult(true);
    }
  };

  const resetTrivia = () => {
    setCurrentTriviaIndex(0);
    setSelectedTriviaOption(null);
    setTriviaScore(0);
    setShowTriviaResult(false);
  };

  return (
    <div className="w-full max-w-5xl mx-auto px-4 py-8 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-800">
        <div>
          <div className="flex items-center space-x-2 text-cyan-400 text-xs font-mono mb-1">
            <Gamepad2 className="w-4 h-4" />
            <span>GLOBAL INTELLECTUAL ARENA</span>
          </div>
          <h1 className="text-3xl font-bold tracking-tight text-slate-100">
            {t.gameTab}
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            Bridge minds across continents through strategic chess, five-in-a-row, and planetary knowledge challenges.
          </p>
        </div>

        {/* Game Switcher Tabs */}
        <div className="flex items-center space-x-2 p-1 rounded-xl bg-slate-900 border border-slate-800 self-start sm:self-auto">
          <button
            onClick={() => setActiveGame('gomoku')}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium cursor-pointer transition-all ${
              activeGame === 'gomoku'
                ? 'bg-cyan-500 text-slate-950 font-bold'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            {t.playGomoku}
          </button>
          <button
            onClick={() => setActiveGame('trivia')}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium cursor-pointer transition-all ${
              activeGame === 'trivia'
                ? 'bg-cyan-500 text-slate-950 font-bold'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            {t.globalTrivia}
          </button>
        </div>
      </div>

      {/* GAME 1: GOMOKU (Five-in-a-Row) */}
      {activeGame === 'gomoku' && (
        <div className="p-6 rounded-3xl bg-slate-900/80 border border-slate-800 shadow-2xl flex flex-col items-center space-y-6">
          <div className="w-full flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-center space-x-3">
              <span className="text-sm font-bold text-slate-100">{t.playGomoku}</span>
              <span className="text-xs text-slate-400">13x13 Classical Grid</span>
            </div>

            {/* Scoreboard */}
            <div className="flex items-center space-x-4 bg-slate-950 px-4 py-2 rounded-2xl border border-slate-800 text-xs">
              <div className="flex items-center space-x-2">
                <div className="w-3.5 h-3.5 rounded-full bg-slate-900 border border-slate-500 shadow-sm" />
                <span className="text-slate-200 font-medium">You (Black):</span>
                <span className="font-mono font-bold text-cyan-400">{score.player}</span>
              </div>
              <span className="text-slate-600">|</span>
              <div className="flex items-center space-x-2">
                <div className="w-3.5 h-3.5 rounded-full bg-white border border-slate-300 shadow-sm" />
                <span className="text-slate-200 font-medium">Global AI (White):</span>
                <span className="font-mono font-bold text-cyan-400">{score.ai}</span>
              </div>
            </div>

            <button
              onClick={resetGomoku}
              className="flex items-center space-x-1.5 px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium cursor-pointer transition-colors"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Reset Board</span>
            </button>
          </div>

          {/* Turn / Winner announcement */}
          <div className="text-xs">
            {winner ? (
              <div className="px-4 py-2 rounded-xl bg-cyan-500/20 border border-cyan-500/50 text-cyan-300 font-bold flex items-center space-x-2">
                <Trophy className="w-4 h-4 text-amber-400" />
                <span>
                  {winner === 'black' ? 'Victory! You achieved five in a row!' : 'AI Bot connected 5 stones. Play again!'}
                </span>
              </div>
            ) : (
              <span className="text-slate-400 font-medium">
                Current Turn: {currentTurn === 'black' ? 'Your move (Black stone)' : 'AI Calculating...'}
              </span>
            )}
          </div>

          {/* Interactive Gomoku Board */}
          <div className="p-3 sm:p-5 rounded-2xl bg-[#bf8d5e]/90 border-4 border-[#8c5a2c] shadow-2xl overflow-x-auto max-w-full">
            <div
              className="grid gap-0"
              style={{
                gridTemplateColumns: `repeat(${BOARD_SIZE}, minmax(0, 1fr))`,
                width: 'min(480px, 80vw)',
                height: 'min(480px, 80vw)'
              }}
            >
              {board.map((row, r) =>
                row.map((cell, c) => (
                  <div
                    key={`${r}-${c}`}
                    onClick={() => handleCellClick(r, c)}
                    className="relative border border-[#6b421a]/60 flex items-center justify-center cursor-pointer transition-colors hover:bg-black/10"
                  >
                    {/* Intersection Center Point */}
                    <div className="absolute w-1 h-1 rounded-full bg-[#6b421a]/50" />

                    {/* Placed stone */}
                    {cell === 'black' && (
                      <div className="w-[80%] h-[80%] rounded-full bg-gradient-to-tr from-slate-950 via-slate-900 to-slate-700 shadow-md ring-1 ring-slate-800" />
                    )}
                    {cell === 'white' && (
                      <div className="w-[80%] h-[80%] rounded-full bg-gradient-to-tr from-slate-300 via-white to-slate-100 shadow-md ring-1 ring-slate-200" />
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* GAME 2: GLOBAL TRIVIA QUIZ */}
      {activeGame === 'trivia' && (
        <div className="p-6 sm:p-8 rounded-3xl bg-slate-900/80 border border-slate-800 shadow-2xl max-w-2xl mx-auto space-y-6">
          {!showTriviaResult ? (
            <div className="space-y-6">
              <div className="flex items-center justify-between pb-3 border-b border-slate-800 text-xs">
                <span className="font-mono text-cyan-400">
                  Question {currentTriviaIndex + 1} of {triviaQuestions.length}
                </span>
                <span className="font-mono font-bold text-amber-400">
                  Score: {triviaScore} pts
                </span>
              </div>

              <div className="space-y-2">
                <span className="text-[10px] uppercase font-mono px-2 py-0.5 rounded bg-slate-800 text-slate-400">
                  Topic: {triviaQuestions[currentTriviaIndex].country}
                </span>
                <h3 className="text-base sm:text-lg font-bold text-slate-100 leading-snug">
                  {triviaQuestions[currentTriviaIndex].q}
                </h3>
              </div>

              {/* Options */}
              <div className="space-y-2.5">
                {triviaQuestions[currentTriviaIndex].options.map((opt, idx) => {
                  const isChosen = selectedTriviaOption === idx;
                  const isCorrect = idx === triviaQuestions[currentTriviaIndex].answer;
                  const showFeedback = selectedTriviaOption !== null;

                  let btnStyle = 'bg-slate-950/70 border-slate-800 text-slate-200 hover:border-slate-700';
                  if (showFeedback) {
                    if (isCorrect) btnStyle = 'bg-emerald-950/80 border-emerald-500 text-emerald-200';
                    else if (isChosen) btnStyle = 'bg-rose-950/80 border-rose-500 text-rose-200';
                  }

                  return (
                    <button
                      key={idx}
                      onClick={() => handleTriviaAnswer(idx)}
                      disabled={selectedTriviaOption !== null}
                      className={`w-full p-3.5 rounded-xl border text-left text-xs sm:text-sm font-medium transition-all cursor-pointer flex items-center justify-between ${btnStyle}`}
                    >
                      <span>{opt}</span>
                      {showFeedback && isCorrect && (
                        <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                      )}
                    </button>
                  );
                })}
              </div>

              {selectedTriviaOption !== null && (
                <div className="flex justify-end pt-2">
                  <button
                    onClick={nextTrivia}
                    className="px-5 py-2 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold text-xs shadow-md cursor-pointer"
                  >
                    {currentTriviaIndex < triviaQuestions.length - 1 ? 'Next Question →' : 'See Final Score'}
                  </button>
                </div>
              )}
            </div>
          ) : (
            <div className="text-center py-8 space-y-4">
              <Trophy className="w-14 h-14 text-amber-400 mx-auto" />
              <h2 className="text-2xl font-bold text-slate-100">Quiz Completed!</h2>
              <p className="text-sm text-slate-300">
                You earned <span className="font-mono font-bold text-cyan-400 text-lg">{triviaScore}</span> points across planetary trivia!
              </p>
              <button
                onClick={resetTrivia}
                className="px-5 py-2.5 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold text-xs cursor-pointer shadow-lg"
              >
                Play Again
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
