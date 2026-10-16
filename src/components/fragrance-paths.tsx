import Image from "next/image";

const paths = [
  {
    number: "۰۱",
    title: "کشف رایحه‌ها",
    text: "از میان خانواده‌های بویایی و حال‌وهوای مورد علاقه‌ات، مسیر رایحه خودت را پیدا کن.",
    image: "/images/path-discover.jpg",
  },
  {
    number: "۰۲",
    title: "ساخت عطر شخصی",
    text: "در آینده، با راهنمایی آرومان نت‌های محبوبت را ترکیب می‌کنی و به امضای عطری خودت می‌رسی.",
    image: "/images/path-personal.jpg",
    featured: true,
  },
  {
    number: "۰۳",
    title: "عطرهای منتخب",
    text: "مجموعه‌ای از عطرهای انتخاب‌شده برای سلیقه‌ها و داستان‌های متفاوت؛ به‌زودی در آرومان.",
    image: "/images/path-selected.jpg",
  },
];

export function FragrancePaths() {
  return (
    <section className="paths" id="paths" aria-labelledby="paths-title">
      <div className="section-shell">
        <div className="section-heading">
          <p className="kicker centered" dir="ltr" lang="en">
            <span aria-hidden="true" /> THREE WAYS INTO SCENT{" "}
            <span aria-hidden="true" />
          </p>
          <h2 id="paths-title">رایحه را از مسیر خودت پیدا&nbsp;کن</h2>
          <p>
            هر مسیر، پیش‌نمایشی از تجربه‌ای است که به‌زودی در آرومان در دسترس
            خواهد بود.
          </p>
        </div>

        <div className="path-grid">
          {paths.map((path) => (
            <article
              className={path.featured ? "path-card featured" : "path-card"}
              key={path.number}
              tabIndex={0}
            >
              <Image
                src={path.image}
                alt=""
                fill
                sizes="(max-width: 640px) calc(100vw - 32px), (max-width: 900px) 50vw, 33vw"
              />
              <div className="path-overlay" aria-hidden="true" />
              <span className="path-number" aria-hidden="true">
                {path.number}
              </span>
              <div className="path-copy">
                <p>{path.featured ? "قلب تجربه آرومان" : "یک مسیر تازه"}</p>
                <h3>{path.title}</h3>
                <p>{path.text}</p>
                <span className="coming-soon">
                  <span className="status-dot" aria-hidden="true" />
                  به‌زودی در آرومان
                </span>
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
