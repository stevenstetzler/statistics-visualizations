# Feynman–Kac formula — explainer draft

Source: [Wikipedia, "Feynman–Kac formula"](https://en.wikipedia.org/wiki/Feynman%E2%80%93Kac_formula)

This is a working draft: content organized the way the eventual interactive
page should be, with **[VIZ]** tags marking where a figure/widget belongs.
Mirrors the `center_and_spread/` pattern (hand-written page + KaTeX) once we
build it out.

---

## 1. The one-sentence idea

The Feynman–Kac formula says: *the solution to a certain parabolic PDE at
a point `(x, t)` equals the expected value of a "cost" accumulated along a
random path that starts at `x` and wanders forward in time according to a
stochastic differential equation (SDE).*

It's a bridge between two completely different-looking objects:

- **PDE side**: deterministic, defined on a grid, solved by finite
  differences / finite elements.
- **SDE / probability side**: a particle undergoing Brownian-motion-driven
  diffusion, simulated path by path.

**[VIZ] Two-panel "Rosetta stone" diagram** — left panel: a PDE solution
`u(x,t)` as a heatmap/surface over `(x,t)`; right panel: a bundle of
simulated random paths `X_t` starting from the same point. A single
highlighted point `(x,t)` on the left maps to "this is the average of all
these paths' outcomes" on the right. This is the anchor visual for the
whole page — everything else elaborates on it.

## 2. Setting up the pieces

Three ingredients, introduced one at a time so each can get its own small
widget before combining:

1. **The random path** `X_t`, an Itô diffusion:
   `dX_t = μ(X_t,t) dt + σ(X_t,t) dW_t`
   — a drift `μ` pulling the particle in a direction, plus noise `σ dW_t`
   (Brownian motion) jittering it.

   **[VIZ] Drift/diffusion sliders.** Let the user drag `μ` and `σ`
   (constant, for simplicity) and watch a handful of simulated paths
   fan out from a starting point. This is the single most intuitive
   "what is an SDE" visual and should load fast / be draggable in
   real time (cf. `center_and_spread/app.js`'s live-update pattern).

2. **Running cost and discounting**, `V(X_s,s)` and `f(X_s,s)`: the
   particle "decays" at rate `V` (so costs incurred later matter
   exponentially less, via `e^{-∫V ds}`) and accrues cost at rate `f`
   as it moves.

   **[VIZ] "Cost meter."** Along one simulated path, animate a running
   total: a bar or number that integrates `f(X_s,s)` over time while a
   second bar shows the discount factor `e^{-∫_t^s V\,dr}` decaying. Shows
   *why* the formula has an integral term and an exponential term,
   rather than just asserting it.

3. **Terminal payoff** `ψ(X_T)`: a final lump cost evaluated wherever the
   particle ends up at the fixed horizon `T`.

   **[VIZ] Histogram of endpoints.** Run many paths to time `T`, plot a
   histogram of `X_T`, then overlay `ψ(X_T)` evaluated at each endpoint
   (e.g. color-code the histogram by payoff value, or show a second
   histogram of the payoff values themselves). This sets up the Monte
   Carlo average in the next section.

## 3. The theorem, stated

For the PDE

```
∂u/∂t + μ(x,t) ∂u/∂x + ½σ²(x,t) ∂²u/∂x² − V(x,t) u + f(x,t) = 0
```

on `x ∈ ℝ`, `t ∈ [0,T]`, with terminal condition `u(x,T) = ψ(x)`, the
solution is

```
u(x,t) = E[ e^{−∫_t^T V(X_s,s) ds} ψ(X_T)
           + ∫_t^T e^{−∫_t^τ V(X_s,s) ds} f(X_τ,τ) dτ   |  X_t = x ]
```

where `X_t` solves `dX_t = μ(X_t,t) dt + σ(X_t,t) dW_t`.

Read as "expected cost-to-go": a particle starting at `(x,t)`, incurring
running cost `f`, decaying at rate `V` (so future cost is discounted),
with a final cost `ψ(X_T)` — `u(x,t)` is its expected total cost.

**[VIZ] Formula-to-picture labeling.** Lay the formula out with each term
color-coded and connected by leader lines to the corresponding piece of
the particle-cost story above (discount factor ↔ decay, `f` integral ↔
running cost, `ψ(X_T)` ↔ terminal cost, conditioning ↔ "starts at x,t").
Static but valuable — this is the main "aha, the pieces click together"
moment, so it should appear right after the three widgts in §2 have
primed the reader.

**[VIZ] Convergence demo.** The capstone combination of §1–3: pick a
point `(x,t)`, simulate `N` paths, evaluate the bracketed quantity on
each, and show the Monte Carlo average converging to the true `u(x,t)`
as `N` grows (slider or animated counter for `N`; a horizontal line for
the PDE's exact value if known in a toy case). This is exactly the
worked numerical example already in the Wikipedia article (§5 below) and
is the natural second anchor visual, paired with the diagram in §1.

## 4. Why it's true (sketch, not full proof)

Define `g(t,s) = e^{−∫_t^s V(X_r,r) dr}` (the discount factor) and

```
Y_s = g(t,s) u(X_s,s) + ∫_t^s g(t,τ) f(X_τ,τ) dτ
```

Apply Itô's lemma to `u(X_s,s)`, differentiate `Y_s`, and the PDE is
*exactly* the condition that makes the drift term of `dY_s` vanish — i.e.
exactly what's needed for `Y_s` to be a martingale. Once `Y_s` is a
martingale, `u(x,t) = E[Y_t] = E[Y_T | X_t = x]`, and `Y_T` is precisely
the bracketed expression in the theorem.

**[VIZ] "Martingale under a microscope."** Simulate several paths of
`Y_s` itself (not `X_s`) and show that, averaged over many paths, `Y_s`
stays flat (constant expectation) at every intermediate time `s`, even
though each individual path wiggles — i.e., visually demonstrate the
martingale property before/instead of walking through the Itô-calculus
algebra line by line. Good candidate for an "optional, for the curious"
collapsed section, since the proof itself is dense and the article
explicitly doesn't prove the hard direction.

This section is the least visualizable in the narrow sense — it's mostly
algebra — but the martingale-flatness demo above substitutes for walking
through every line.

## 5. Worked numerical example (already in the source article)

Convection–diffusion PDE, `b=1`, `σ=1`, `ψ(x) = e^{−x²}`, `T=1`:

```
∂u/∂t + b ∂u/∂x = −σ² ∂²u/∂x²
```

has the closed form `u(x,t) = (5−4t)^{-1/2} exp(−(1−t+x)²/(5−4t))`, and
equivalently `u(x,t) = E[e^{−X_T²} | X_t = x]` with `dX_t = dt + √2 dW_t`.

**[VIZ] This is the single best visualization opportunity on the page.**
The article already describes (and has a static figure of) exactly this:
Euler–Maruyama-simulated paths, a Monte Carlo estimate of `u` at a grid
of `(x,t)` points, and a comparison against the closed-form surface.
Worth rebuilding as an **interactive** version of that static figure:

- A heatmap/surface of the exact `u(x,t)`.
- An overlaid Monte Carlo estimate, recomputed live as the user changes
  `N` (number of simulated paths) or the Euler–Maruyama step size `Δt`,
  so error/noise visibly shrinks.
- A slider over `t` producing the "vertical slice" comparison the article
  describes in words (exact curve vs. noisy MC curve at fixed `t`).

This is a direct, self-contained numerical-methods demo (no finance or
quantum-mechanics context needed) and a strong candidate for the first
full build.

## 6. Generalizations (lower priority for visualization)

- **N dimensions**: same formula, `X_t` is now vector-valued,
  `½σ²∂²_x` becomes `½Σᵢⱼ(σσᵗ)ᵢⱼ ∂²/∂xᵢ∂xⱼ`. **[VIZ, stretch]** 2D version
  of the §5 demo — a particle diffusing in the plane, cost/payoff as a
  function on ℝ², Monte Carlo average converging to a PDE solution shown
  as a 2D heatmap. Natural "harder" follow-on to §5, not needed for a
  first pass.
- **Elliptic case / Dirichlet problem**: no time derivative; instead the
  particle runs until it exits a bounded domain `D` at a random exit time
  `τ_D`, and `u(x) = E[cost accumulated until exit, plus boundary payoff
  ψ(X_{τ_D})]`. **[VIZ]** Good, cheap visual: simulate a 2D random walk
  inside a disk or square, color the boundary by `ψ`, show paths exiting
  at random points/times, and the exit-time histogram. Conceptually
  distinct from the time-driven picture in §1–5 ("wanders until it
  hits a wall" vs. "runs for a fixed time"), so worth its own small
  figure even without full PDE machinery.
- **Space-time domains**: combination of the above two generalizations.
  Mention in text only; no new visualization needed beyond §6's two
  demos.

## 7. Applications

- **Finance (Black–Scholes)**: stock price `S_t` as geometric Brownian
  motion, option payoff `(S_T−K)^+` as the terminal cost `ψ`, risk-free
  rate `r` as the discount `V`. The option's no-arbitrage price *is* a
  Feynman–Kac expectation, and plugging in literally recovers the
  Black–Scholes PDE.

  **[VIZ]** Reskin of the §5 demo: paths are stock-price trajectories
  (log-normal, not Gaussian), the payoff is `(S_T−K)^+` instead of
  `e^{−x²}`, and the "PDE surface" is the Black–Scholes option-price
  surface. Good second worked example once §5's machinery exists —
  mostly a parameter/payoff swap, not new code. Also a natural place to
  note the limits: American options (no fixed expiry) and path-dependent
  ("average") options don't fit the formula directly — worth a callout,
  not a visualization.

- **Quantum mechanics / quantum chemistry**: diffusion Monte Carlo for
  the Schrödinger equation. Mention for completeness; **not a priority
  to visualize** — it requires explaining imaginary time and the
  ground-state projection trick, which is a detour from the core SDE↔PDE
  story this page is telling. A single sentence + link is enough.

## 8. Context / history (text only, no visualization)

Kac and Feynman were colleagues at Cornell in 1947; Kac realized Feynman's
path-integral heuristic (real-valued case) could be made rigorous via
probability theory. The complex-valued case needed for actual quantum
mechanics is still open. Kac's original 1949 paper framed it as computing
distributions of Wiener functionals — worth one paragraph of framing, no
widget.

---

## Build priority (my recommendation)

1. §1 two-panel diagram (orientation) + §2 drift/diffusion sliders —
   cheapest, highest clarity payoff.
2. §5 interactive Euler–Maruyama vs. exact-solution demo — the
   centerpiece; directly upgrades a figure already in the source article.
3. §3 convergence demo + formula labeling — ties 1 and 2 together.
4. §7 finance reskin — cheap once §5 exists, high relatability.
5. §4 martingale-flatness demo and §6 elliptic/exit-time demo — optional
   "for the curious" sections if time allows.
