import React, { useState } from 'react';
import { Language, User } from '../../types/index.ts';
import { translations } from '../../i18n/translations.ts';
import { SpaceFlight3D } from './SpaceFlight3D.tsx';
import { GravitySandbox } from './GravitySandbox.tsx';
import { SpaceChess } from './SpaceChess.tsx';
import {
  Gamepad2,
  Trophy,
  RotateCcw,
  Sparkles,
  Zap,
  Orbit,
  Swords,
  Globe,
  CheckCircle2,
  Rocket
} from 'lucide-react';

interface GameCenterProps {
  currentUser: User | null;
  lang: Language;
}

export const GameCenter: React.FC<GameCenterProps> = ({ currentUser, lang }) => {
  const t = translations[lang] || translations.zh;

  const [activeGame, setActiveGame] = useState<'flight' | 'gravity' | 'chess' | 'gomoku' | 'trivia'>('flight');

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
      let nr = r + d1[0];
      let nc = c + d1[1];
      while (nr >= 0 && nr < BOARD_SIZE && nc >= 0 && nc < BOARD_SIZE && grid[nr][nc] === player) {
        count++;
        nr += d1[0];
        nc += d1[1];
      }
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

    // AI Counter-move
    setTimeout(() => {
      let bestR = -1;
      let bestC = -1;
      let maxLocalScore = -1;

      for (let i = 0; i < BOARD_SIZE; i++) {
        for (let j = 0; j < BOARD_SIZE; j++) {
          if (!newBoard[i][j]) {
            let neighborCount = 0;
            for (let di = -1; di <= 1; di++) {
              for (let dj = -1; dj <= 1; dj++) {
                const ni = i + di;
                const nj = j + dj;
                if (ni >= 0 && ni < BOARD_SIZE && nj >= 0 && nj < BOARD_SIZE && newBoard[ni][nj]) {
                  neighborCount++;
                }
              }
            }
            const centerDist = Math.abs(i - 6) + Math.abs(j - 6);
            const currentScore = neighborCount * 10 - centerDist;
            if (currentScore > maxLocalScore) {
              maxLocalScore = currentScore;
              bestR = i;
              bestC = j;
            }
          }
        }
      }

      if (bestR !== -1 && bestC !== -1) {
        newBoard[bestR][bestC] = 'white';
        setBoard(newBoard);
        if (checkFiveInARow(newBoard, bestR, bestC, 'white')) {
          setWinner('white');
          setScore(s => ({ ...s, ai: s.ai + 1 }));
          return;
        }
      }
      setCurrentTurn('black');
    }, 350);
  };

  const resetGomoku = () => {
    setBoard(Array(BOARD_SIZE).fill(null).map(() => Array(BOARD_SIZE).fill(null)));
    setCurrentTurn('black');
    setWinner(null);
  };

  // -------------------------------------------------------------
  // 2. GLOBAL TRIVIA QUIZ
  // -------------------------------------------------------------
  const triviaQuestions = [
    {
      country: 'France',
      q: 'Which historic Parisian landmark on the Île de la Cité dates back to 1163?',
      options: ['Eiffel Tower', 'Notre-Dame Cathedral', 'Arc de Triomphe', 'Louvre Pyramid'],
      answer: 1
    },
    {
      country: 'Egypt',
      q: 'Which ancient wonder of the world is located in Giza near Cairo?',
      options: ['Colossus of Rhodes', 'Great Pyramid of Giza', 'Lighthouse of Alexandria', 'Hanging Gardens'],
      answer: 1
    },
    {
      country: 'Japan',
      q: 'What is Japan’s highest sacred mountain, located on Honshu Island?',
      options: ['Mount Fuji', 'Mount Tate', 'Mount Hiei', 'Mount Yari'],
      answer: 0
    },
    {
      country: 'Brazil',
      q: 'What is the largest tropical rainforest on Earth, spanning across northern South America?',
      options: ['Congo Basin', 'Amazon Rainforest', 'Taiga', 'Valdivian Forest'],
      answer: 1
    },
    {
      country: 'China',
      q: 'Which ancient Silk Road starting point served as the imperial capital for thirteen dynasties?',
      options: ['Beijing', 'Luoyang', "Xi'an (Chang'an)", 'Nanjing'],
      answer: 2
    }
  ];

  const [currentTriviaIndex, setCurrentTriviaIndex] = useState(0);
  const [selectedTriviaOption, setSelectedTriviaOption] = useState<number | null>(null);
  const [triviaScore, setTriviaScore] = useState(0);
  const [showTriviaResult, setShowTriviaResult] = useState(false);

  const handleTriviaAnswer = (optIndex: number) => {
    if (selectedTriviaOption !== null) return;
    setSelectedTriviaOption(optIndex);
    if (optIndex === triviaQuestions[currentTriviaIndex].answer) {
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
    <div className="max-w-7xl mx-auto px-4 py-8 space-y-8 animate-in fade-in">
      {/* Hero Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-6 border-b border-slate-800">
        <div>
          <div className="flex items-center space-x-2 text-cyan-400 text-xs font-mono mb-1">
            <Gamepad2 className="w-4 h-4" />
            <span>GLOBAL INTELLECTUAL & COSMIC ARENA</span>
          </div>
          <h1 className="text-3xl font-bold tracking-tight text-slate-100">
            {t.gameTab}
          </h1>
          <p className="text-xs text-slate-400 mt-1 max-w-2xl">
            Explore 3D space flight, cosmic gravitational simulations, grandmaster chess, five-in-a-row, and planetary trivia.
          </p>
        </div>

        {/* Game Switcher Tabs */}
        <div className="flex flex-wrap items-center gap-1.5 p-1.5 rounded-2xl bg-slate-900 border border-slate-800">
          <button
            onClick={() => setActiveGame('flight')}
            className={`flex items-center space-x-1.5 px-3 py-2 rounded-xl text-xs font-medium cursor-pointer transition-all ${
              activeGame === 'flight'
                ? 'bg-gradient-to-r from-cyan-500 to-blue-600 text-slate-950 font-bold shadow-md shadow-cyan-500/20'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Rocket className="w-3.5 h-3.5" />
            <span>3D 太空穿梭</span>
          </button>

          <button
            onClick={() => setActiveGame('gravity')}
            className={`flex items-center space-x-1.5 px-3 py-2 rounded-xl text-xs font-medium cursor-pointer transition-all ${
              activeGame === 'gravity'
                ? 'bg-gradient-to-r from-cyan-500 to-blue-600 text-slate-950 font-bold shadow-md shadow-cyan-500/20'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Orbit className="w-3.5 h-3.5" />
            <span>天体引力沙盒</span>
          </button>

          <button
            onClick={() => setActiveGame('chess')}
            className={`flex items-center space-x-1.5 px-3 py-2 rounded-xl text-xs font-medium cursor-pointer transition-all ${
              activeGame === 'chess'
                ? 'bg-gradient-to-r from-cyan-500 to-blue-600 text-slate-950 font-bold shadow-md shadow-cyan-500/20'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Swords className="w-3.5 h-3.5" />
            <span>星际国际象棋</span>
          </button>

          <button
            onClick={() => setActiveGame('gomoku')}
            className={`flex items-center space-x-1.5 px-3 py-2 rounded-xl text-xs font-medium cursor-pointer transition-all ${
              activeGame === 'gomoku'
                ? 'bg-gradient-to-r from-cyan-500 to-blue-600 text-slate-950 font-bold shadow-md shadow-cyan-500/20'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>{t.playGomoku}</span>
          </button>

          <button
            onClick={() => setActiveGame('trivia')}
            className={`flex items-center space-x-1.5 px-3 py-2 rounded-xl text-xs font-medium cursor-pointer transition-all ${
              activeGame === 'trivia'
                ? 'bg-gradient-to-r from-cyan-500 to-blue-600 text-slate-950 font-bold shadow-md shadow-cyan-500/20'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Globe className="w-3.5 h-3.5" />
            <span>{t.globalTrivia}</span>
          </button>
        </div>
      </div>

      {/* ACTIVE GAME VIEW CONTAINER */}

      {/* GAME 1: 3D SPACE FLIGHT SIMULATOR */}
      {activeGame === 'flight' && <SpaceFlight3D lang={lang} />}

      {/* GAME 2: GRAVITY SANDBOX */}
      {activeGame === 'gravity' && <GravitySandbox lang={lang} />}

      {/* GAME 3: SPACE CHESS */}
      {activeGame === 'chess' && <SpaceChess lang={lang} />}

      {/* GAME 4: GOMOKU */}
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
                    <div className="absolute w-1 h-1 rounded-full bg-[#6b421a]/50" />
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

      {/* GAME 5: GLOBAL TRIVIA QUIZ */}
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
