function PageIntroCard({ eyebrow, title, description, titleAction = null, children }) {
  return (
    <section className="page-card">
      <div className="page-card__topline">
        <span className="page-card__eyebrow">{eyebrow}</span>
        {titleAction ? <div className="page-card__action">{titleAction}</div> : null}
      </div>
      <div className="page-card__heading">
        <h1 className="page-card__title">{title}</h1>
      </div>
      <p className="page-card__description">{description}</p>
      {children}
    </section>
  );
}

export default PageIntroCard;
