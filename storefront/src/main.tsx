import { useEffect, useReducer, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import "../../docs/design/tokens.css";
import "./styles.css";
import { app, call, openLink, postMessage, tellModel } from "./bridge";
import { initial, itemsWith, next, type Busy, type Screen, type State } from "./machine";
import { Button, Footer, Icon, Notice, Photo, Price, Status, Stepper, Timeline } from "./ui";
import { parseView, usd, type Cart, type Order, type Product, type Store } from "./views";

const POLL_MS = 3000;
const POLL_LIMIT_MS = 10 * 60 * 1000; // SYS-MCP-06

function Storefront() {
  const [state, dispatch] = useReducer(next, initial);
  const run = async (busy: Exclude<Busy, null>, name: string, args: Record<string, unknown>) => {
    dispatch({ type: "start", busy });
    try {
      const view = await call(name, args);
      dispatch({ type: "view", view });
      return view;
    } catch {
      dispatch({ type: "failed", message: "Shelf isn't answering. Try again." });
      return null;
    }
  };

  useEffect(() => {
    app.ontoolresult = (r) => {
      const view = parseView(r.structuredContent);
      dispatch(view ? { type: "view", view } : { type: "failed", message: "This answer has no Storefront view." });
    };
    app.ontoolinput = (p) => {
      const a = p.arguments as { order_id?: unknown; order_token?: unknown } | undefined;
      if (typeof a?.order_id === "string" && typeof a.order_token === "string") dispatch({ type: "order_token", id: a.order_id, token: a.order_token });
    };
    app.onhostcontextchanged = (c) => { if (c.theme) document.documentElement.dataset.theme = c.theme; };
    app.connect().then(() => {
      const theme = app.getHostContext()?.theme;
      if (theme) document.documentElement.dataset.theme = theme;
    }).catch(() => dispatch({ type: "failed", message: "This chat app can't show the Storefront. Ask in the chat instead." }));
  }, []);

  const api: Actions = {
    show: (id) => void run("show", "show_product", { product_id: id }),
    setQuantity: async (store, variantId, quantity) => {
      const view = await run("cart", "update_cart", { ...(state.cart ? { cart_id: state.cart.id } : {}), store, items: itemsWith(state.cart?.store.slug === store ? state.cart : null, variantId, quantity) });
      if (view?.view === "cart") tellModel(`The buyer changed the cart in the Storefront. Cart ${view.cart.id}, total ${usd(view.cart.total)}.`);
    },
    pay: async (cart) => {
      const view = await run("pay", "start_checkout", { cart_id: cart.id });
      if (view?.view !== "checkout") return;
      tellModel(`The buyer started checkout. Order ${view.order_id}; order token ${view.order_token}. Not paid until get_order_status says captured.`);
      if (!(await openLink(view.pay_url))) dispatch({ type: "link_refused" });
    },
    refund: (order, token, reason) => void run("refund", "request_refund", { order_id: order.id, order_token: token, reason }),
    backToCart: () => dispatch({ type: "back_to_cart" }),
    retryPay: (state) => state.cart && api.pay(state.cart),
  };

  return (
    <main className="sf" aria-busy={state.busy !== null}>
      {state.notice && <Notice>{state.notice}</Notice>}
      <ScreenView state={state} api={api} dispatch={dispatch} />
      <Footer />
    </main>
  );
}

interface Actions {
  show(id: string): void;
  setQuantity(store: string, variantId: string, quantity: number): Promise<void>;
  pay(cart: Cart): Promise<void>;
  refund(order: Order, token: string, reason: string): void;
  backToCart(): void;
  retryPay(state: State): void;
}

function ScreenView({ state, api, dispatch }: { state: State; api: Actions; dispatch: (e: Parameters<typeof next>[1]) => void }) {
  const s: Screen = state.screen;
  switch (s.kind) {
    case "waiting":
      return <p className="muted">Loading Shelf…</p>;
    case "failed":
      return <Notice>{s.message}</Notice>;
    case "results":
      return <Results products={s.products} onOpen={api.show} busy={state.busy === "show"} />;
    case "product":
      return <ProductView product={s.product} store={s.store} busy={state.busy === "cart"} onAdd={(v) => api.setQuantity(s.store.slug, v, (state.cart?.lines.find((l) => l.variant_id === v)?.quantity ?? 0) + 1)} />;
    case "cart":
      return <CartView cart={s.cart} notice={s.notice} busy={state.busy} onQuantity={(v, q) => api.setQuantity(s.cart.store.slug, v, q)} onPay={() => api.pay(s.cart)} />;
    case "checkout":
      return <Checkout screen={s} onTimeout={() => dispatch({ type: "poll_timeout" })} onRetry={() => api.retryPay(state)} dispatch={dispatch} />;
    case "order":
      return <OrderView order={s.order} justPaid={s.justPaid} token={state.order?.id === s.order.id ? state.order.token : null} busy={state.busy === "refund"} onRefund={api.refund} />;
  }
}

function Results({ products, onOpen, busy }: { products: Extract<Screen, { kind: "results" }>["products"]; onOpen: (id: string) => void; busy: boolean }) {
  if (products.length === 0) return <p className="card-body">No products match yet. Try a wider search.</p>;
  return (
    <section aria-label="Products">
      <p className="meta">{products.length} {products.length === 1 ? "product" : "products"}</p>
      <ul className="row" aria-busy={busy}>
        {products.map((p) => (
          <li key={p.id}>
            <button type="button" className="product-card" onClick={() => onOpen(p.id)} disabled={busy}>
              <Photo src={p.image_url} alt={p.title} />
              <span className="product-card-title">{p.title}</span>
              <span className="product-card-meta">
                <Price money={p.price_from} /> <span className="meta">{p.store.name}</span>
              </span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

const optionText = (o: Record<string, string>) => Object.values(o).join(", ") || "One option";

function ProductView({ product, store, busy, onAdd }: { product: Product; store: Store; busy: boolean; onAdd: (variantId: string) => void }) {
  const firstInStock = product.variants.find((v) => v.in_stock) ?? product.variants[0];
  const [chosen, setChosen] = useState(firstInStock?.id ?? "");
  const variant = product.variants.find((v) => v.id === chosen) ?? firstInStock;
  const optionName = Object.keys(product.variants[0]?.options ?? {})[0];
  return (
    <section className="product">
      <div className="product-head">
        <Photo src={product.images[0] ?? ""} alt={product.title} className="product-photo" />
        <div className="product-text">
          <h2 className="title">{product.title}</h2>
          {variant && <Price money={variant.price} />}
          <p className="body">{product.description}</p>
          <p className="meta">{store.name}{store.refund_policy ? ` · ${store.refund_policy}` : ""}</p>
        </div>
      </div>
      {product.variants.length > 1 && (
        <fieldset className="variants">
          <legend className="meta">{optionName ?? "Option"}</legend>
          {product.variants.map((v) => (
            <button key={v.id} type="button" className={`variant ${v.id === chosen ? "is-on" : ""}`} aria-pressed={v.id === chosen} disabled={!v.in_stock} onClick={() => setChosen(v.id)}>
              {optionText(v.options)} · {usd(v.price)}
              {!v.in_stock && <span className="sold-out">Sold out</span>}
            </button>
          ))}
        </fieldset>
      )}
      <div className="actions">
        <Button busy={busy} disabled={!variant?.in_stock} onClick={() => variant && onAdd(variant.id)}>
          {variant?.in_stock ? "Add to cart" : "Sold out"}
        </Button>
      </div>
    </section>
  );
}

function CartView({ cart, notice, busy, onQuantity, onPay }: { cart: Cart; notice: string | null; busy: Busy; onQuantity: (variantId: string, q: number) => void; onPay: () => void }) {
  const issues = cart.validation_issues.filter((i) => !cart.lines.some((l) => l.variant_id === i.variant_id));
  return (
    <section className="cart">
      <header className="cart-head">
        <span className="strong">{cart.store.name}</span>
        {cart.store.refund_policy && <span className="meta">{cart.store.refund_policy}</span>}
      </header>
      {notice && <Notice>{notice}</Notice>}
      <ul className="lines">
        {cart.lines.map((l) => (
          <li key={l.variant_id} className="line">
            <div>
              <p className="strong">{l.title}</p>
              <p className="meta">{optionText(l.options)} · {usd(l.unit_price)} each</p>
              {l.issue && <p className="issue">{l.issue}</p>}
            </div>
            <div className="line-right">
              <Stepper value={l.quantity} disabled={busy !== null} label={l.title} onChange={(q) => onQuantity(l.variant_id, q)} />
              <Price money={l.line_total} />
            </div>
          </li>
        ))}
        {issues.map((i) => (
          <li key={`issue-${i.variant_id}`} className="line">
            <p className="issue">{i.message}</p>
          </li>
        ))}
      </ul>
      {cart.lines.length === 0 ? (
        <p className="muted">Your cart is empty.</p>
      ) : (
        <>
          <div className="sum"><span className="meta">Shipping</span><Price money={cart.shipping} /></div>
          <div className="sum total"><span>Total</span><Price money={cart.total} large /></div>
          <div className="actions">
            <Button busy={busy === "pay"} disabled={busy !== null || cart.state !== "ready"} onClick={onPay}>
              Pay {usd(cart.total)} with PayPal
            </Button>
          </div>
        </>
      )}
    </section>
  );
}

function Checkout({ screen, onTimeout, onRetry, dispatch }: { screen: Extract<Screen, { kind: "checkout" }>; onTimeout: () => void; onRetry: () => void; dispatch: (e: Parameters<typeof next>[1]) => void }) {
  const started = useRef(Date.now());
  useEffect(() => {
    if (screen.timedOut) return;
    let stopped = false;
    const tick = async () => {
      if (stopped) return;
      if (Date.now() - started.current > POLL_LIMIT_MS) { onTimeout(); return; }
      try {
        const view = await call("get_order_status", { order_id: screen.orderId, order_token: screen.token });
        if (stopped) return;
        if (view.view === "order") {
          dispatch({ type: "view", view });
          if (view.order.state === "captured") { postMessage(`Paid. Order ${view.order.id}.`); return; }
          if (view.order.state === "cancelled") return;
        }
      } catch { /* the next tick tries again */ }
      setTimeout(tick, POLL_MS);
    };
    const first = setTimeout(tick, POLL_MS);
    return () => { stopped = true; clearTimeout(first); };
  }, [screen.orderId, screen.token, screen.timedOut, onTimeout, dispatch]);

  return (
    <section className="checkout">
      <div className="sum"><span className="strong">Total</span><Price money={screen.total} large /></div>
      {screen.timedOut ? (
        <div className="box box-wait">
          <Status tone="wait" icon="alert">Payment not finished</Status>
          <p className="body">PayPal didn't finish. Your cart is saved.</p>
          <Button kind="secondary" onClick={onRetry}>Try again</Button>
        </div>
      ) : (
        <div className="box box-wait">
          <Status tone="wait" icon="clock">Waiting for PayPal</Status>
          <p className="body">Finish in PayPal. This card updates by itself.</p>
          <a className="link" href={screen.payUrl} target="_blank" rel="noopener noreferrer" onClick={(e) => { e.preventDefault(); void openLink(screen.payUrl); }}>
            Open PayPal checkout <Icon name="external" size={12} />
          </a>
        </div>
      )}
    </section>
  );
}

const ORDER_STATUS: Record<Order["state"], { tone: "paid" | "wait" | "danger" | "neutral"; icon: Parameters<typeof Icon>[0]["name"]; word: string }> = {
  created: { tone: "wait", icon: "clock", word: "Waiting for payment" },
  approved: { tone: "wait", icon: "clock", word: "Finishing payment" },
  captured: { tone: "paid", icon: "check", word: "Paid" },
  shipped: { tone: "paid", icon: "truck", word: "Shipped" },
  refunded: { tone: "neutral", icon: "undo", word: "Refunded" },
  cancelled: { tone: "wait", icon: "alert", word: "Payment not finished" },
};

function OrderView({ order, justPaid, token, busy, onRefund }: { order: Order; justPaid: boolean; token: string | null; busy: boolean; onRefund: (o: Order, token: string, reason: string) => void }) {
  const [asking, setAsking] = useState(false);
  const [reason, setReason] = useState("");
  const rr = order.refund_request;
  const what = order.lines.map((l) => `${l.title}${Object.keys(l.options).length ? `, ${optionText(l.options)}` : ""}`).join(" · ");
  const canAsk = token !== null && (order.state === "captured" || order.state === "shipped") && (!rr || rr.state === "declined" || rr.state === "failed");

  let head = <Status {...ORDER_STATUS[order.state]} tone={ORDER_STATUS[order.state].tone}>{ORDER_STATUS[order.state].word}</Status>;
  if (rr?.state === "pending") head = <Status tone="wait" icon="undo">Refund requested</Status>;
  if (rr?.state === "declined") head = <Status tone="danger" icon="x">Declined</Status>;

  return (
    <section className="order">
      {order.state === "captured" && !rr ? (
        <div className={`box box-paid ${justPaid ? "is-moment" : ""}`}>
          <svg className="moment-check" width="28" height="28" viewBox="0 0 28 28" aria-hidden="true">
            <circle cx="14" cy="14" r="12.5" fill="none" stroke="currentColor" strokeWidth="1.5" />
            <path d="M8.5 14.5l3.5 3.5 7.5-8" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <div>
            <p className="moment-word">Paid</p>
            <p className="moment-amount"><Price money={order.total} large /> <span className="body">to {order.store}</span></p>
            <p className="meta mono">Order {order.id} · PayPal</p>
          </div>
        </div>
      ) : (
        <header className="order-head">{head}<Price money={order.total} /></header>
      )}
      {!(order.state === "captured" && !rr) && <p className="strong">{what}</p>}
      {rr?.state === "pending" && <p className="meta">Waiting for the seller. The seller decides refunds; no money moves until they approve.</p>}
      {rr?.state === "declined" && <p className="body">{order.store} declined{rr.decline_reason ? `: “${rr.decline_reason}”` : "."}</p>}
      {order.state === "refunded" && <p className="body">PayPal refunded {usd(order.total)} to you. It can take a few days to show.</p>}
      {order.tracking && (
        <p className="tracking"><Icon name="truck" /> <span className="mono">{order.tracking.carrier} · {order.tracking.number}</span></p>
      )}
      <Timeline items={order.timeline} />
      {canAsk && !asking && <div className="actions"><Button kind="quiet" onClick={() => setAsking(true)}>Ask for a refund</Button></div>}
      {canAsk && asking && token && (
        <form className="refund" onSubmit={(e) => { e.preventDefault(); if (reason.trim()) onRefund(order, token, reason.trim()); }}>
          <label className="meta" htmlFor="reason">Why do you want a refund?</label>
          <textarea id="reason" maxLength={500} rows={3} value={reason} onChange={(e) => setReason(e.target.value)} />
          <div className="actions">
            <Button busy={busy} disabled={!reason.trim()} onClick={() => reason.trim() && onRefund(order, token, reason.trim())}>Ask the seller</Button>
            <Button kind="quiet" onClick={() => setAsking(false)}>Cancel</Button>
          </div>
        </form>
      )}
    </section>
  );
}

const root = document.getElementById("root");
if (root) createRoot(root).render(<Storefront />);
