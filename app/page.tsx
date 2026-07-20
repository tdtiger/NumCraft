"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

// 選択できるゲームモードを定義
type GameMode = "max" | "target" | null;
// 現在の状態を定義
type GameState = "menu" | "playing" | "finished";

// 数字・演算子カードの型
type Card = 
{
  id: number;
  label: string;
  used: boolean;
};

// スコアの内訳を管理する型
type ScoreDetail =
{
  expressionValue: number;
  baseScore: number;
  elapsedSeconds: number;
  timeBonus: number;
  totalScore: number;
  targetValue?: number;
  difference?: number;
}

// 1~9の数字カードをランダムに4枚、各種演算子1枚ずつの計9枚を生成する
// 全てをまとめたCard型の配列を返す
const generateCards = (): Card[] =>
{
  const numbers = Array.from({length: 5}, (_, index) => (
  {
    id: index + 1,
    label: String(Math.floor(Math.random() * 9) + 1),
    used: false,
  }));

  const operators = ["+", "-", "×", "÷"].map((operator, index) =>(
    {
      id: index + 6,
      label: operator,
      used: false,
    }));

  return [...numbers, ...operators];
};

// ゆくゆくは式をパースして計算するようにしたいという願望
type ASTNode = 
  | {
    type: "number";
    value: number;
  }
  | {
    type: "binary";
    operator: string;
    left: ASTNode;
    right: ASTNode;
  };
  
// アクセス時のトップページ
export default function Home()
{
  // 選択されているゲームモードと、それを変更する関数
  const [selectedMode, setSelectedMode] = useState<GameMode>(null);
  // 選択されているカードと、それをセットする関数
  const [selectedCards, setSelectedCards] = useState<Card[]>([]);
  // 使えるカードと、それをセットする関数
  const [cards, setCards] = useState<Card[]>(generateCards());
  // 計算結果とそれを更新する関数
  const [result, setResult] = useState<string | null>(null);
  // ゲーム状態と、それをセットする関数
  const [gameState, setGameState] = useState<GameState>("menu");
  // プレイ開始時間と、それをセットする関数
  const [startTime, setStartTime] = useState<number | null>(null);
  // スコアと、それをセットする関数
  const [score, setScore] = useState<ScoreDetail | null>(null);
  // 残り時間と、それをセットする関数
  const [timeLeft, setTimeLeft] = useState(60);
  // 目標値と、それをセットする関数
  const [targetValue, setTargetValue] = useState<number | null>(null);
  // ニックネームと、それをセットする関数
  const [nickname, setNickname] = useState("");
  // 送信中かどうかの状態と、それをセットする関数
  const [isSubmitting, setIsSubmitting] = useState(false);
  // 
  const [isSubmitted, setIsSubmitted] = useState(false);
  // 
  const [ranking, setRanking] = useState<any[]>([]);
  // ↑こいつらが呼ばれるたびに、状態変更→レンダリング→画面更新

  const today = new Date().toLocaleDateString("ja-JP", {
    year: "numeric",
    month: "long",
    day: "numeric"
  });

  // カードを選択する関数
  const addCard = (card: Card) => 
  {
    if(card.used)
      return;

    setSelectedCards([...selectedCards, card]);

    setCards(
      cards.map((c) =>
        c.id === card.id ? {...c, used: true} : c
      )
    );
  };

  // 選択済みカードを未使用に戻す関数
  const undoCard = () =>
  {
    if(selectedCards.length === 0)
      return;

    // 取り消されたカードを取得
    const lastCard = selectedCards[selectedCards.length - 1];

    // 最後のカードだけ切り出し
    setSelectedCards(selectedCards.slice(0, -1));

    setCards(
      cards.map((card) =>
        card.id === lastCard.id
          ? {...card, used: false}
          : card
      )
    );
  };

  // 全てのカードの選択状態を解除する関数
  const clearCards = () =>
  {
    setSelectedCards([]);

    setCards(
      cards.map((card) => (
      {
        ...card, used: false,
      }))
    );
  };

  // ゲーム開始時に呼び出す関数
  const startGame = () =>
  {
    setCards(generateCards());
    setSelectedCards([]);
    setResult(null);
    setScore(null);
    setStartTime(Date.now());
    setTimeLeft(60);

    // 目標値モードなら、50以下の整数をランダムに生成
    if(selectedMode === "target")
    {
      setTargetValue(Math.floor(Math.random() * 51));
    }
    else
    {
      setTargetValue(null);
    }

    setGameState("playing");
  };

  const resetGame = () =>
  {
    setCards(generateCards());
    setSelectedCards([]);
    setResult(null);
  };

  // 状態監視
  useEffect(() => 
  {
    if(gameState !== "playing")
    {
      return;
    }

    if(timeLeft <= 0)
    {
      setResult("時間切れ");
      setScore(null);
      setGameState("finished");
      return;
    }

    const timerId = setTimeout(() =>
    {
      setTimeLeft(timeLeft - 1);
    }, 1000);

    return () =>
    {
      clearTimeout(timerId);
    };
  }, [gameState, timeLeft]);

  const expression = selectedCards.map((card) => card.label).join(" ");

  // 作成された式を計算する関数
  const calculateExpression = () => 
  {
    // カードが選択されていない場合
    if(selectedCards.length === 0)
    {
      setResult("式が空です");
      return;
    }

    // カードが全て使用されていない場合
    if(selectedCards.length !== cards.length)
    {
      setResult(`カードを全て使ってください。残り${cards.length - selectedCards.length}枚です。`);
      return;
    }

    const tokens = selectedCards.map((card) => card.label);

    // 式の形がおかしい場合
    if(!validateSimpleExpression(tokens))
    {
      setResult("式の形が正しくありません。");
      return;
    }

    // 文字列に変換されている数式を、数字を数字として解釈し直す
    const parsedTokens = tokens.map((token) => 
    {
      if(!Number.isNaN(Number(token)))
      {
        return Number(token);
      }

      return token;
    });

    const afterMultiplyDivide: (number | string)[] = [];

    let i = 0;
    
    // 掛け算、割り算の計算順序を調節するための処理
    // 将来的にはこの処理には頼らないようにしたい
    while(i < parsedTokens.length)
    {
      const current = parsedTokens[i];

      if(current === "×" || current === "÷")
      {
        const left = afterMultiplyDivide.pop();
        const right = parsedTokens[i + 1];

        if(typeof left !== "number" || typeof right !== "number")
        {
          setResult("式の形が正しくありません。2");
          return;
        }

        if(current === "÷" && right === 0)
        {
          setResult("0では割れません。");
          return;
        }

        const calculated = (current === "×") ? left * right : left / right;

        afterMultiplyDivide.push(calculated);
        i += 2;
      }
      else
      {
        afterMultiplyDivide.push(current);
        i += 1;
      }
    }

    let value = afterMultiplyDivide[0];

    if(typeof value !== "number")
    {
      setResult("式の形が正しくありません。3");
      return;
    }

    for(let j = 1; j < afterMultiplyDivide.length; j += 2)
    {
      const operator = afterMultiplyDivide[j];
      const nextNumber = afterMultiplyDivide[j + 1];

      if(typeof operator !== "string" || typeof nextNumber !== "number")
      {
        setResult("式の形が正しくありません。4");
        return;
      }

      if(operator === "+")
      {
        value += nextNumber;
      }
      else if(operator === "-")
      {
        value -= nextNumber;
      }
    }

    // 得点計算のためのパラメータたち
    const elapsedSeconds = (startTime === null) ? 60 : Math.floor((Date.now() - startTime) / 1000);
    const remainingSeconds = Math.max(0, 60 - elapsedSeconds);
    const timeBonus = remainingSeconds * 10;

    if(selectedMode === "target" && targetValue !== null)
    {
      const difference = Math.abs(value - targetValue);
      const baseScore = Math.max(0, 1000 - difference * 20);
      const totalScore = Math.round(baseScore + timeBonus);

      setResult(String(value));
      setScore(
        {
          expressionValue: value,
          baseScore,
          elapsedSeconds,
          timeBonus,
          totalScore,
          targetValue,
          difference,
        }
      );
      setGameState("finished");
      return;
    }

    const baseScore = Math.floor(Math.abs(value));
    const totalScore = Math.round(baseScore + timeBonus);

    setResult(String(value));
    setScore(
      {
        expressionValue: value,
        baseScore,
        elapsedSeconds,
        timeBonus,
        totalScore
      }
    );
    setGameState("finished");
  };

  const validateSimpleExpression = (tokens: string[]) =>
  {
    // 演算子の両隣には必ず数字が存在するため、余りが0になるのはおかしい
    if(tokens.length % 2 === 0)
    {
      return false;
    }

    for(let i = 0; i < tokens.length; i++)
    {
      const token = tokens[i];

      if(i % 2 === 0)
      {
        if(Number.isNaN(Number(token)))
        {
          return false;
        }
      }
      else
      {
        if(!["+", "-", "×", "÷"].includes(token))
        {
          return false;
        }
      }
    }
    
    return true;
  };

  const submitScore = async () =>
  {
    if(!nickname.trim())
    {
      window.alert("ニックネームを入力してください");
      return;
    }

    setIsSubmitted(true);

    const {error} = await supabase
      .from("scores")
      .insert({
        nickname,
        mode: selectedMode,
        expression,
        score: score?.totalScore,
        result_value: result
      });

    if(error)
    {
      window.alert("スコアの登録に失敗しました");
      console.error(error);
    }
    else
    {
      setIsSubmitted(true);
      await fetchRanking();
    }

    setIsSubmitting(false);
  }

  const fetchRanking = async() =>
  {
    const {data, error} = await supabase
      .from("scores")
      .select("*")
      .eq("mode", selectedMode)
      .order("score", {ascending: false})
      .limit(10);

    if(error)
    {
      console.error("ランキングの取得に失敗しました", error);
      return;
    }

    setRanking(data ?? []);
  }

  // ブラウザに表示する内容
  return(
    <main className = "min-h-screen bg-slate-950 px-6 py-12 text-white">
      <div className = "mx-auto max-w-4xl">
        <header className = "text-center">
          <p className = "mb-3 text-sm font-bold tracking-[0.3em] text-cyan-400">
            DAILY MATH PUZZLE
          </p>

          <h1 className = "text-5xl font-black tracking-tight sm:text-6xl">
            NumCraft
          </h1>

          <p className = "mt-5 text-slate-400">
            数字カードで課題に合わせた式を作ろう
          </p>

          <div className = "mt-4 flex items-center justify-between text-sm text-slate-500">
            <span>
              Today's Challenge
            </span>
            <span>
              {today}
            </span>
          </div>

        </header>

        {/* <section className = "mt-12">
          <label htmlFor = "nickname" className = "mb-2 block text-sm font-semibold text-slate-300">
            ニックネーム
          </label>

          <input
            id = "nickname" type = "text" placeholder = "名前を入力" maxLength = {20}
            className = "w-full rounded-xl border border-slate-700 bg-slate-900 px-4 py-3 outline-none transition focus:border-cyan-400"
          />
        </section> */}

        <section className = "mt-8 grid gap-5 md:grid-cols-2">
          <article 
            className = {`rounded-2xl border bg-slate-900 p-6 transition ${
            selectedMode === "max"
              ? "border-cyan-400 shadow-lg shadow-cyan-400/10"
              : "border-slate-800"
            }`}
          >
            <p className = "text-sm font-bold text-cyan-400">DAILY MAX</p>
              
            <h2 className = "mt-2 text-2xl font-bold">最大値モード</h2>
              
            <p className = "mt-3 text-sm leading-6 text-slate-400">
              制限時間内に、できるだけ大きな値を取る式を作り上げましょう。
            </p>
  
            <button type = "button"
              onClick = {() => setSelectedMode("max")}
              className = "mt-6 w-full rounded-xl bg-cyan-400 px-4 py-3 font-bold text-slate-950 transition hover:bg-cyan-300"
            >
              {selectedMode === "max" ? "選択中" : "挑戦する"}
            </button>
          </article>

          <article className = {`rounded-2xl border bg-slate-900 p-6 transition ${
            selectedMode === "target"
              ? "border-violet-400 shadow-lg shadow-violet-400/10"
              : "border-slate-800"
            }`}
          >
            <p className = "text-sm font-bold text-violet-400">DAILY TARGET</p>

            <h2 className = "mt-2 text-2xl font-bold">目標値モード</h2>

            <p className = "mt-3 text-sm leading-6 text-slate-400">
              カードを組み合わせて、指定された目標値にできるだけ近づけましょう。
            </p>
              
            <button type = "button"
              onClick = {() => setSelectedMode("target")}
              className = "mt-6 w-full rounded-xl bg-violet-400 px-4 py-3 font-bold text-slate-950 transition hover:bg-violet-300"
            >
              {selectedMode === "target" ? "選択中" : "挑戦する"}
            </button>
          </article>
        </section>

        {selectedMode !== null && (
          <section className = "mt-8 rounded-2xl border border-slate-800 bg-slate-900/60 p-6">
            <div className = "text-center">
              <p className = "text-sm text-slate-400">選択したモード</p>

              <p className = "mt-2 text-xl font-bold">
                {selectedMode === "max" ? "最大値モード" : "目標値モード"}
              </p>
            </div>

            <section className = "mt-6 rounded-2xl border border-slate-800 bg-slate-950 p-5">
              <h3 className = "text-lg font-bold">
                ルール
              </h3>

              <ul className = "mt-3 space-y-2 text-sm leading-6 text-slate-400">
                <li>・数字カード5枚と演算子カード4枚を使って式を作ります。</li>
                <li>・カードは全て1回ずつ使ってください。</li>
                <li>・最大値モードでは、式の絶対値が大きいほど高得点です。</li>
                <li>・目標値モードでは、目標値に近いほど高得点です。</li>
                <li>・早く答えるほどタイムボーナスが加算されます。バカにならんくらい高いです。</li>
              </ul>
            </section>

            <button
              type = "button" onClick = {startGame}
              className = "mt-5 rounded-xl bg-white px-8 py-3 font-bold text-slate-950 transition hover:bg-slate-200"
            >
              ゲーム開始
            </button>

            {gameState === "playing" && (
              <>
              {selectedMode === "target" && targetValue !== null && (
                <section className = "mt-8 rounded-2xl border border-violet-400/40 bg-violet-400/10 p-5 text-center">
                  <p className = "text-sm text-violet-300">
                    目標値
                  </p>
                  <p className = "mt-1 text-5xl font-black text-violet-200">
                    {targetValue}
                  </p>
                </section>
              )}

              <section className = "mt-8 rounded-2xl border border-slate-800 bg-slate-950 p-5 text-center">
                <p className = "text-sm text-slate-400">
                  残り時間
                </p>
                <p className = {`mt-1 text-5xl font-black transition-colors duration-300 ${
                  timeLeft <= 5
                    ? "text-red-400 animate-pulse"
                    : timeLeft <= 10
                    ? "text-red-400"
                    : timeLeft <= 30
                    ? "text-yellow-300"
                    : "text-cyan-300"
                }`}>
                  {timeLeft}
                </p>
              </section>

              <section className = "mt-8">
                <h3 className = "text-lg font-bold">カード</h3>

                <div className = "mt-4 grid grid-cols-5 gap-3 sm:grid-cols-10">
                  {cards.map((card) => (
                    <button
                      key = {card.id} type = "button" onClick = {() => addCard(card)} disabled = {card.used}
                      className = 
                      {
                        `rounded-xl py-4 text-xl font-black transition-all duration-150 active:scale-95
                        ${
                          card.used
                            ? "bg-slate-800 text-slate-500 opacity-60 cursor-not-allowed"
                            : "border border-slate-700 bg-slate-950 shadow-md shadow-black/20 hover:-translate-y-1 hover:scale-105 hover:border-cyan-400 hover:bg-slate-800 hover:shadow-lg hover:shadow-cyan-400/10"
                        }`
                      }
                    >
                      {card.label}
                    </button>
                  ))}
                </div>
              </section>
              
              <section className = "mt-8">
                <h3 className = "text-lg font-bold">あなたの式</h3>

                <div className = "mt-4 min-h-20 rounded-xl border border-slate-700 bg-slate-950 p-4 text-2xl font-bold">
                  {expression || (
                    <span className = "text-base font-normal text-slate-500">
                      カードを選択してください
                    </span>
                  )}
                </div>

                <div className = "mt-4 flex gap-3">
                  <button
                    type = "button" onClick = {undoCard}
                    className = "rounded-xl border border-slate-700 px-5 py-3 font-bold transition-all duration-150 hover:-translate-y-0.5 hover:bg-slate-800 active:scale-95"
                  >
                    1つ戻す
                  </button>

                  <button
                    type = "button" onClick = {clearCards}
                    className = "rounded-xl border border-slate-700 px-5 py-3 font-bold transition-all duration-150 hover:-translate-y-0.5 hover:bg-slate-800 active:scale-95"
                  >
                    全て消す
                  </button>

                  <button
                    type = "button" onClick = {resetGame}
                    className = "rounded-xl border border-slate-700 px-5 py-3 font-bold transition-all duration-150 hover:-translate-y-0.5 hover:bg-slate-800 active:scale-95 "
                  >
                    新しいカード
                  </button>
                </div>

                <div className = "mt-4">
                  <button
                    type = "button" onClick = {calculateExpression}
                    className = "w-full rounded-xl bg-white px-5 py-3 font-bold text-slate-950 transition hover:bg-slate-200"
                  >
                    計算する
                  </button>
                </div>
              </section>
              </>
              )}

              {gameState === "finished" && result !== null && (
                <section className = "mt-8 rounded-2xl border border-cyan-400/40 bg-cyan-400/10 p-6 text-center">
                  <p className = "text-sm text-cyan-300">
                    RESULT
                  </p>
                  <p className = "mt-3 text-2xl font-black">
                    計算結果：{result}
                  </p>

                  {score !== null && (
                      <div className = "mt-5 rounded-xl border border-slate-700 bg-slate-950 p-5 text-left">
                        <p className = "text-sm font-bold text-cyan-300">
                          スコア内訳
                        </p>

                        <div className = "mt-3 space-y-2 text-sm text-slate-300">
                          <p>
                            式の値：{score.expressionValue}
                          </p>

                          {selectedMode === "target" && score.targetValue !== undefined ? (
                            <>
                            <p>
                              目標値：{score.targetValue}
                            </p>
                            <p>
                              差：|{score.expressionValue} - {score.targetValue}| = {score.difference}
                            </p>
                            <p>
                              基礎点：1000 - 差 × 20 = {score.baseScore}点
                            </p>
                            </>
                          ): (
                            <p>
                              基礎点：|{score.expressionValue}| = {score.baseScore}点
                            </p>
                          )}

                          <p>
                            タイムボーナス：{Math.max(0, 60 - score.elapsedSeconds)}秒 × 10 = {" "}{score.timeBonus}点
                          </p>
                        </div>

                        <p className = "mt-5 text-center text-5xl font-black text-cyan-200">
                          {score.totalScore}
                        </p>
                      </div>
                  )}

                  <div className = "mt-6 rounded-xl border border-slate-700 bg-slate-900 p-5">
                    <h3 className = "text-lg font-bold">ランキング登録</h3>

                    <input
                      type = "text" maxLength = {20} value = {nickname}
                      onChange = {(e) => setNickname(e.target.value)}
                      placeholder = "ニックネームを入力"
                      className = "mt-4 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 outline-none focus:border-cyan-400"
                    />
                    <p className = "mt-2 text-xs text-slate-500">
                      ※ランキングは公開されます。個人情報を含まないようにしてください。
                    </p>

                  {isSubmitted ? (
                    <div className = "mt-4 rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-4 text-center">
                      <p className = "font-bold text-emerald-300">
                        ランキングに登録しました！
                      </p>
                      <p className = "mt-1 text-sm text-slate-400">
                        参加ありがとうございます。
                      </p>
                    </div>
                  ) : (
                    <button 
                      type = "button" onClick = {submitScore} disabled = {isSubmitting || isSubmitted}
                      className = "mt-4 w-full rounded-lg bg-cyan-500 py-3 font-bold text-slate-950transition hover:bg-cyan-400 disabled:opacity-50"
                    >
                      {
                        isSubmitting
                        ? "登録中..."
                        : "ランキングに登録"
                      }
                    </button>
                  )}
                  </div>

                  <section className = "mt-6 rounded-2xl border border-slate-700 bg-slate-950 p-5 text-left">
                    <div className = "flex items-center justify-between">
                      <h3 className = "text-lg font-bold text-white">
                        ランキング
                      </h3>
                      <span className = "rounded-full border border-cyan-400/40 px-3 py-1 text-xs font-bold text-cyan-300">
                        ※まだまだ未完成
                      </span>
                    </div>

                    {ranking.length === 0 ? (
                      <p className = "mt-4 text-slate-400">
                        まだ記録がありません。
                      </p>
                    ) : (
                      <div className = "mt-4 space-y-2">
                        {ranking.map((item, index) => (
                          <div 
                            key = {item.id}
                            className = "flex items-center justify-between rounded-lg bg-slate-800 px-4 py-3"
                          >
                            <div>
                              <p className = "font-bold">
                                #{index + 1} {item.nickname}
                              </p>
                              <p className = "text-xs text-slate-400">
                                {item.expression}
                              </p>
                            </div>

                            <p className = "text-xl font-black text-cyan-300">
                              {item.score}
                            </p>
                          </div>
                        ))}
                      </div>
                    )}
                  </section>

                  <button
                    type = "button" onClick = {startGame}
                    className = "mt-6 rounded-xl bg-white px-8 py-3 font-bold text-slate-950 transition hover:bg-slate-200"
                  >
                    もう一度遊ぶ
                  </button>
                </section>
              )}
            </section>
          )}
        </div>
    </main>
  );
}