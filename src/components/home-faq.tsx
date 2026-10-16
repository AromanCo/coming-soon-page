const questions = [
  {
    question: "آرومان دقیقاً چیه؟",
    answer:
      "آرومان تجربه‌ای برای کشف رایحه‌ها، انتخاب عطرهای منتخب و ساخت عطر شخصیه؛ جایی که می‌خوایم انتخاب عطر رو ساده‌تر، خلاقانه‌تر و شخصی‌تر کنیم.",
  },
  {
    question: "آیا می‌تونم عطر مخصوص خودم رو بسازم؟",
    answer:
      "ساخت عطر شخصی یکی از مهم‌ترین قابلیت‌هایی است که برای آرومان در حال توسعه داریم. هدفمون اینه که هم با راهنمایی قدم‌به‌قدم و هم در یک استودیوی خلاقانه، امکان طراحی رایحه شخصی فراهم بشه.",
  },
  {
    question: "برای انتخاب عطر باید عطرشناسی بلد باشم؟",
    answer:
      "نه! آرومان قراره کمک کنه با شناخت سلیقه، حس‌وحال و رایحه‌های موردعلاقه‌ات، راحت‌تر مسیر انتخاب عطرت رو پیدا کنی.",
  },
  {
    question: "آرومان چه زمانی شروع به کار می‌کنه؟",
    answer:
      "هنوز تاریخ قطعی شروع فعالیت رو اعلام نکردیم. با عضویت در لیست دعوت، می‌تونی از خبرهای شروع آرومان باخبر بشی.",
  },
  {
    question: "عضویت در لیست دعوت چه فایده‌ای داره؟",
    answer:
      "اعضای این لیست برای دریافت دعوت‌نامه دسترسی زودهنگام به استودیوی ساخت عطر آرومان در اولویت قرار می‌گیرن.",
  },
] as const;

export function HomeFaq() {
  return (
    <section className="home-faq" aria-labelledby="home-faq-title">
      <div className="section-shell home-faq-layout">
        <div className="home-faq-heading">
          <p className="kicker" dir="ltr" lang="en">
            <span aria-hidden="true" /> AROMAN, EXPLAINED
          </p>
          <h2 id="home-faq-title">بیشتر با آرومان آشنا شو</h2>
          <p>چند پاسخ کوتاه درباره دنیایی که داریم می‌سازیم.</p>
        </div>

        <div className="home-faq-list">
          {questions.map((item) => (
            <details key={item.question}>
              <summary>
                <span>{item.question}</span>
                <span className="faq-indicator" aria-hidden="true" />
              </summary>
              <div className="home-faq-answer">
                <p>{item.answer}</p>
              </div>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}
