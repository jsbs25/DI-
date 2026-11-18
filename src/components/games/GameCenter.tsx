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

  const gameTabs = [
    { id: 'flight' as const, icon: Rocket, label: lang === 'zh' ? '3D 太空穿梭' : 'Space Flight' },
    { id: 'gravity' as const, icon: Orbit, label: lang === 'zh' ? '天体引力沙盒' : 'Gravity Sandbox' },
    { id: 'chess' as const, icon: Swords, label: lang === 'zh' ? '星际国际象棋' : 'Space Chess' },
    { id: 'gomoku' as const, icon: Sparkles, label: t.playGomoku },
    { id: 'trivia' as const, icon: Globe, label: t.globalTrivia }
  ];

  return (
    <div className="mx-auto w-full max-w-7xl space-y-8 px-4 py-8 sm:px-6">
      <div className="flex flex-col justify-between gap-4 border-b border-[var(--color-one-border)] pb-6 sm:flex-row sm:items-center">
        <div>
          <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-[var(--color-one-border-strong)] bg-white/[0.03] px-3 py-1 text-[11px] font-medium text-[var(--color-one-text-muted)]">
            <Gamepad2 className="h-3.5 w-3.5 text-[var(--color-one-accent)]" />
            <span>ONE GAMES · {lang === 'zh' ? '互动与探索' : 'Play & Explore'}</span>
          </div>
          <h1 className="text-3xl font-semibold tracking-tight text-white">{t.gameTab}</h1>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-[var(--color-one-text-muted)]">
            {lang === 'zh' ? '体验 3D 太空穿梭、引力沙盒、国际象棋、五子棋与全球知识问答等真实互动模块。' : 'Explore 3D space flight, gravity sandbox, chess, gomoku, and global trivia experiences.'}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-1.5 rounded-[22px] border border-[var(--color-one-border)] bg-white/[0.03] p-1.5 shadow-[var(--shadow-one-sm)]">
          {gameTabs.map(tab => {
            const Icon = tab.icon;
            const active = activeGame === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveGame(tab.id)}
                className={`inline-flex min-h-10 cursor-pointer items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-medium transition ${active ? 'bg-[var(--color-one-accent)] text-[#071018] shadow-[var(--shadow-one-sm)]' : 'text-[var(--color-one-text-muted)] hover:bg-white/[0.05] hover:text-white'}`}
              >
                <Icon className="h-3.5 w-3.5" />
                <span>{tab.label}</span>
              </button>
            );
          })}
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
        <div className="flex flex-col items-center space-y-6 rounded-[28px] border border-[var(--color-one-border)] bg-white/[0.03] p-6 shadow-[var(--shadow-one-sm)]">
          <div className="flex w-full flex-wrap items-center justify-between gap-3">
            <div className="flex items-center space-x-3">
              <span className="text-sm font-semibold text-white">{t.playGomoku}</span>
              <span className="text-xs text-[var(--color-one-text-muted)]">13x13 Classical Grid</span>
            </div>

            {/* Scoreboard */}
            <div className="flex flex-wrap items-center gap-4 rounded-2xl border border-[var(--color-one-border)] bg-[rgba(10,14,22,0.55)] px-4 py-2 text-xs">
              <div className="flex items-center space-x-2">
                <div className="w-3.5 h-3.5 rounded-full bg-slate-900 border border-slate-500 shadow-sm" />
                <span className="font-medium text-[var(--color-one-text)]">You (Black):</span>
                <span className="font-mono font-semibold text-[var(--color-one-accent-soft)]">{score.player}</span>
              </div>
              <span className="text-slate-600">|</span>
              <div className="flex items-center space-x-2">
                <div className="w-3.5 h-3.5 rounded-full bg-white border border-slate-300 shadow-sm" />
                <span className="font-medium text-[var(--color-one-text)]">Global AI (White):</span>
                <span className="font-mono font-semibold text-[var(--color-one-accent-soft)]">{score.ai}</span>
              </div>
            </div>

            <button
              onClick={resetGomoku}
              className="inline-flex min-h-10 cursor-pointer items-center gap-1.5 rounded-xl border border-[var(--color-one-border)] bg-white/[0.02] px-3 py-2 text-xs font-medium text-[var(--color-one-text-muted)] transition hover:bg-white/[0.05] hover:text-white"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Reset Board</span>
            </button>
          </div>

          {/* Turn / Winner announcement */}
          <div className="text-xs">
            {winner ? (
              <div className="flex items-center gap-2 rounded-xl border border-[rgba(78,161,255,0.35)] bg-[rgba(78,161,255,0.12)] px-4 py-2 font-semibold text-[var(--color-one-accent-soft)]">
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
          <div className="max-w-full overflow-x-auto rounded-2xl border-4 border-[#8c5a2c] bg-[#bf8d5e]/90 p-3 shadow-[var(--shadow-one-md)] sm:p-5">
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
        <div className="mx-auto w-full max-w-2xl space-y-6 rounded-[28px] border border-[var(--color-one-border)] bg-white/[0.03] p-6 shadow-[var(--shadow-one-sm)] sm:p-8">
          {!showTriviaResult ? (
            <div className="space-y-6">
              <div className="flex items-center justify-between border-b border-[var(--color-one-border)] pb-3 text-xs">
                <span className="font-mono text-[var(--color-one-accent-soft)]">
                  Question {currentTriviaIndex + 1} of {triviaQuestions.length}
                </span>
                <span className="font-mono font-semibold text-amber-300">
                  Score: {triviaScore} pts
                </span>
              </div>

              <div className="space-y-2">
                <span className="rounded bg-white/[0.06] px-2 py-0.5 font-mono text-[10px] uppercase text-[var(--color-one-text-muted)]">
                  Topic: {triviaQuestions[currentTriviaIndex].country}
                </span>
                <h3 className="text-base font-semibold leading-snug text-white sm:text-lg">
                  {triviaQuestions[currentTriviaIndex].q}
                </h3>
              </div>

              {/* Options */}
              <div className="space-y-2.5">
                {triviaQuestions[currentTriviaIndex].options.map((opt, idx) => {
                  const isChosen = selectedTriviaOption === idx;
                  const isCorrect = idx === triviaQuestions[currentTriviaIndex].answer;
                  const showFeedback = selectedTriviaOption !== null;

                  let btnStyle = 'border-[var(--color-one-border)] bg-[rgba(10,14,22,0.55)] text-[var(--color-one-text)] hover:border-[var(--color-one-border-strong)] hover:bg-white/[0.05]';
                  if (showFeedback) {
                    if (isCorrect) btnStyle = 'border-emerald-500/35 bg-emerald-500/10 text-emerald-100';
                    else if (isChosen) btnStyle = 'border-rose-500/35 bg-rose-500/10 text-rose-100';
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
                    className="inline-flex min-h-11 cursor-pointer items-center rounded-xl bg-[var(--color-one-accent)] px-5 py-2 text-xs font-semibold text-[#071018] shadow-[var(--shadow-one-sm)] hover:brightness-110"
                  >
                    {currentTriviaIndex < triviaQuestions.length - 1 ? 'Next Question →' : 'See Final Score'}
                  </button>
                </div>
              )}
            </div>
          ) : (
            <div className="text-center py-8 space-y-4">
              <Trophy className="w-14 h-14 text-amber-400 mx-auto" />
              <h2 className="text-2xl font-semibold text-white">Quiz Completed!</h2>
              <p className="text-sm text-[var(--color-one-text-muted)]">
                You earned <span className="font-mono font-bold text-cyan-400 text-lg">{triviaScore}</span> points across planetary trivia!
              </p>
              <button
                onClick={resetTrivia}
                className="inline-flex min-h-11 cursor-pointer items-center rounded-xl bg-[var(--color-one-accent)] px-5 py-2.5 text-xs font-semibold text-[#071018] shadow-[var(--shadow-one-sm)] hover:brightness-110"
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
