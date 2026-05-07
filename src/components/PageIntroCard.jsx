function PageIntroCard({ eyebrow, title, description, titleAction = null, children }) {
  const hasTopline = Boolean(eyebrow || titleAction);
  const hasDescription = Boolean(description);
  const toplineClassName = `page-card__topline${
    !eyebrow && titleAction ? " page-card__topline--actions-only" : ""
  }`;

  return (
    <section className="page-card">
      {hasTopline ? (
        <div className={toplineClassName}>
          {eyebrow ? <span className="page-card__eyebrow">{eyebrow}</span> : null}
          {titleAction ? <div className="page-card__action">{titleAction}</div> : null}
        </div>
      ) : null}
      <div className="page-card__heading">
        <h1 className="page-card__title">{title}</h1>
      </div>
      {hasDescription ? <p className="page-card__description">{description}</p> : null}
      {children}
    </section>
  );
}

export default PageIntroCard;
