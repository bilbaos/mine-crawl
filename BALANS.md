# Mine-Crawl: analiza balansu i boss Arch-Golem

Balans sprawdzony symulatorem (`tools/sim/sim.js`), który odwzorowuje zasady z `game.js`:
generowanie planszy, bezpieczny start, dynamiczne cyfry, kaskady, walkę, przedmioty, awanse, sklep i Węzeł.
Każdy profil to 400 pełnych kampanii.

## Boty
- **Losowy klikacz**: klika losowe zakryte pola, zbiera to, co widzi, nie używa zaklęć.
- **Rozważny gracz**: dedukuje z sum poziomów (pola, gdzie każdy wróg byłby słabszy od ATK, są bezpieczne), zabija słabych wrogów dla EXP, używa Echokacji i Dezintegracji przy niepewności, kupuje mikstury w sklepie.

## Wyniki (procent graczy po ukończeniu sektora 1…10)

| Profil | S1 | S2 | S3 | S4 | S5 | S6 | S7 | S8 | S9 | S10 | Wygrane |
|---|---|---|---|---|---|---|---|---|---|---|---|
| PRZED: losowy, nielimitowane powroty do Węzła | 83 | 63 | 55 | 24 | 21 | 21 | 21 | 21 | 21 | 21 | **21%** |
| PRZED: rozważny, bez ulepszeń | 100 | 100 | 100 | 100 | 100 | 100 | 100 | 100 | 100 | 100 | 100% |
| PO: losowy | 83 | 54 | 46 | 23 | 22 | 4 | 1 | 0 | 0 | 0 | **0%** |
| PO: rozważny, bez ulepszeń | 100 | 100 | 100 | 100 | 100 | 100 | 92 | 71 | 54 | 43 | **43%** |
| PO: rozważny, średnie ulepszenia | 100 | 100 | 100 | 100 | 100 | 100 | 100 | 100 | 100 | 100 | 100% |
| PO: rozważny, bez ulepszeń, bez żadnej śmierci | 100 | 100 | 100 | 100 | 100 | 99 | 99 | 71 | 47 | 12 | 12% |

Zablokowane plansze (brak jakiegokolwiek ruchu naprzód): **0 na 4003** sektory.

## Co zmieniono i dlaczego
1. **Iskry Węzła (3 na wyprawę) i powrót do sektora 6.** Wcześniej po sektorze 5 śmierć nic nie kosztowała (powtórka tego samego sektora bez limitu), więc nawet losowe klikanie wygrywało: gracz ginął, ale zachowywał EXP i w końcu przerastał wrogów. Teraz śmierć cofa do Węzła, kolejna próba zaczyna się od sektora 6 (poziom zostaje), a po 3 powrotach wyprawa się kończy. Świeży gracz wygrywa rzadziej (43%), ale ulepszenia trwałe wyraźnie pomagają, co wzmacnia sens meta-progresji.
2. **Sektory 2–4 gęstsze** (0.23 / 0.24 / 0.25, więcej Strażników i Brutali): losowe klikanie szybciej się mści, a rozważny gracz nadal przechodzi je bez strat.
3. **Sektor 8 luźniejszy** (0.29 → 0.28): wygładza skok trudności przed finałem.
4. **Sektor 10 = arena bossa** (14×14, gęstość 0.22, 1 mimik).
5. Sektor 1 bez zmian (stały skład 14 wrogów, próg 75 EXP, mnożnik 1.8).

## Boss: Arch-Golem Matrycy (sektor 10, w trybie nieskończonym co 10. sektor)
- Zajmuje **2×2 zakryte pola**. Każda część liczy się do cyfr, więc w jego okolicy sumy sięgają 30–60 i wpadają w czerwone progi.
- Poziom części na starcie = **ATK gracza + 8** (min. 9). Zamiast klucza i włazu są **3 Pieczęcie Rdzenia**: każda obniża poziom części o 2.
- **Przebudzenie** po ostatniej pieczęci albo po pierwszym ciosie: Golem staje się widoczny, a jego **puls co 4 ruchy zadaje 1 obrażenie** (tarcza go zatrzymuje).
- Przed przebudzeniem **Gniew**: co 8 ruchów w ciemności rodzi się nowy wróg (maks. 8), a cyfry wokół niego rosną.
- Każda zniszczona część **osłabia pozostałe o 1**. Po 3 pieczęciach części mają kolejno ATK+2, +1, 0, −1, czyli razem 3 obrażenia. Do finału trzeba się przygotować: zdrowie, tarcza albo Dezintegracja na najgroźniejszą część.
- Nagroda: **+60 Złotych Run** poza zwykłą nagrodą za sektor.
- Parametry w `game.js` w stałej `BOSS`.
