"use client";

export default function FeaturesSection() {
  const features = [
    {
      icon: (
        <svg width="337" height="33" viewBox="0 0 337 33" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M13.2522 23.9086C11.9484 24.6501 10.4313 25.075 8.81225 25.075C3.94549 25.075 0.000199832 21.2359 0.000200246 16.5001C0.00020066 11.7644 3.94549 7.92534 8.81225 7.92534C10.4313 7.92534 11.9484 8.35023 13.2522 9.09167" stroke="#F7F7F7" strokeWidth="2.26772" strokeLinecap="round"/>
          <path d="M17.2386 19.884L20.6223 16.5004L17.2386 13.1167" stroke="#F7F7F7" strokeWidth="2.26772" strokeLinecap="round"/>
          <path d="M20.6223 16.5007L9.5045 16.5007" stroke="#F7F7F7" strokeWidth="2.26772" strokeLinecap="round"/>
          <text fill="#F7F7F7" xmlSpace="preserve" style={{whiteSpace: "pre"}} fontFamily="Inter" fontSize="20.4094" fontWeight="600" letterSpacing="0em">
            <tspan x="30.6114" y="23.9216">Your work stays yours. Always.</tspan>
          </text>
        </svg>
      ),
      title: "Your work stays yours. Always.",
      description: "Your book is the source. We never claim rights, reuse content elsewhere or train on your work. You stay in full control of your voice, ownership and distribution.",
      opacity: 0.25
    },
    {
      icon: (
        <svg width="214" height="33" viewBox="0 0 214 33" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M19.3705 17.7408C19.3705 23.3767 14.8017 27.9456 9.16582 27.9456C5.14148 27.9456 1.66123 25.6161 -5.66758e-05 22.2319" stroke="#F7F7F7" strokeWidth="2.26772" strokeLinecap="round"/>
          <path d="M22.0415 20.6497L19.5611 17.1256L16.037 19.606" stroke="#F7F7F7" strokeWidth="2.26772" strokeLinecap="round"/>
          <path d="M6.48647 5.72735V6.61395C7.07206 6.67415 7.57282 6.79455 7.98875 6.97515C8.41016 7.15576 8.77683 7.4294 9.08878 7.79607C9.33506 8.07519 9.52387 8.36251 9.65522 8.65804C9.79204 8.95357 9.86045 9.22447 9.86045 9.47075C9.86045 9.74439 9.7592 9.98246 9.55671 10.185C9.35969 10.382 9.11888 10.4805 8.8343 10.4805C8.29796 10.4805 7.95044 10.1904 7.79173 9.61031C7.61113 8.92621 7.17604 8.47196 6.48647 8.24758V11.6626C7.16509 11.8487 7.70416 12.0183 8.10368 12.1716C8.50867 12.3248 8.86987 12.5465 9.18729 12.8365C9.52661 13.1375 9.78657 13.4987 9.96717 13.9201C10.1532 14.3361 10.2463 14.7931 10.2463 15.2911C10.2463 15.915 10.0985 16.5006 9.80298 17.0478C9.51293 17.5897 9.08331 18.033 8.51414 18.3777C7.94497 18.7225 7.26908 18.9278 6.48647 18.9934V21.0375C6.48647 21.3604 6.45363 21.5957 6.38796 21.7435C6.32775 21.8913 6.19093 21.9652 5.9775 21.9652C5.78047 21.9652 5.64092 21.905 5.55883 21.7846C5.48221 21.6642 5.4439 21.4781 5.4439 21.2263V19.0098C4.80358 18.9387 4.24262 18.7882 3.76101 18.5583C3.28488 18.3285 2.88536 18.0439 2.56247 17.7046C2.24504 17.3598 2.00971 17.0041 1.85648 16.6374C1.70324 16.2652 1.62662 15.9013 1.62662 15.5456C1.62662 15.2829 1.72786 15.0475 1.93036 14.8396C2.13832 14.6261 2.39555 14.5194 2.70202 14.5194C2.9483 14.5194 3.15627 14.5769 3.32592 14.6918C3.49558 14.8067 3.61324 14.9682 3.67892 15.1761C3.82668 15.6249 3.95529 15.9697 4.06475 16.2105C4.17421 16.4458 4.33839 16.662 4.5573 16.859C4.78169 17.0561 5.07722 17.2066 5.4439 17.3105V13.4933C4.71054 13.2908 4.09759 13.0664 3.60504 12.8201C3.11248 12.5684 2.71297 12.2126 2.40649 11.7529C2.10001 11.2932 1.94678 10.7021 1.94678 9.97972C1.94678 9.0384 2.24504 8.26673 2.84158 7.66473C3.44359 7.06272 4.31103 6.71246 5.4439 6.61395V5.74377C5.4439 5.28406 5.61629 5.0542 5.96108 5.0542C6.31134 5.0542 6.48647 5.27858 6.48647 5.72735ZM5.4439 11.3589V8.21474C4.98418 8.35156 4.62571 8.53217 4.36849 8.75655C4.11127 8.98094 3.98266 9.32025 3.98266 9.77449C3.98266 10.2068 4.10306 10.5352 4.34386 10.7596C4.58467 10.9785 4.95134 11.1783 5.4439 11.3589ZM6.48647 13.797V17.3926C7.03922 17.2832 7.4661 17.0615 7.7671 16.7277C8.06811 16.3938 8.21861 16.0053 8.21861 15.562C8.21861 15.0858 8.07084 14.7192 7.77531 14.4619C7.48525 14.1993 7.05564 13.9776 6.48647 13.797Z" fill="#F7F7F7"/>
          <text fill="#F7F7F7" xmlSpace="preserve" style={{whiteSpace: "pre"}} fontFamily="Inter" fontSize="20.4094" fontWeight="600" letterSpacing="0em">
            <tspan x="32.5526" y="23.9216">Make more money</tspan>
          </text>
        </svg>
      ),
      title: "Make more money",
      description: "Your book does not live in one format or one language. Fable helps you reach more readers, in more places, without splitting focus or sacrificing quality.",
      opacity: 0.25
    },
    {
      icon: (
        <svg width="253" height="33" viewBox="0 0 253 33" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M6.99067 12.8442C6.99067 16.7051 3.86081 19.835 -6.10352e-05 19.835" stroke="#F7F7F7" strokeWidth="1.70079"/>
          <path d="M6.9906 26.8257C6.9906 22.9648 3.86075 19.835 -0.00012207 19.835" stroke="#F7F7F7" strokeWidth="1.70079"/>
          <path d="M13.9811 19.835C10.1203 19.835 6.99042 16.7051 6.99042 12.8442" stroke="#F7F7F7" strokeWidth="1.70079"/>
          <path d="M6.99042 26.8257C6.99042 22.9648 10.1203 19.835 13.9811 19.835" stroke="#F7F7F7" strokeWidth="1.70079"/>
          <path d="M16.9411 6.17383C16.9411 8.61898 14.9589 10.6012 12.5138 10.6012" stroke="#F7F7F7" strokeWidth="1.70079"/>
          <path d="M16.9409 15.0287C16.9409 12.5835 14.9587 10.6013 12.5135 10.6013" stroke="#F7F7F7" strokeWidth="1.70079"/>
          <path d="M21.3687 10.6012C18.9236 10.6012 16.9414 8.61898 16.9414 6.17383" stroke="#F7F7F7" strokeWidth="1.70079"/>
          <path d="M16.9414 15.0287C16.9414 12.5835 18.9236 10.6013 21.3687 10.6013" stroke="#F7F7F7" strokeWidth="1.70079"/>
          <text fill="#F7F7F7" xmlSpace="preserve" style={{whiteSpace: "pre"}} fontFamily="Inter" fontSize="20.4094" fontWeight="600" letterSpacing="0em">
            <tspan x="31.358" y="23.9216">Marketing Automation</tspan>
          </text>
        </svg>
      ),
      title: "Marketing Automation",
      description: "Fable turns your book into structured content automatically. Quotes, hooks, summaries and ideas are generated and adapted across formats so you can stay consistent without manual effort.",
      opacity: 0.25
    },
    {
      icon: (
        <div className="flex items-center gap-[2.119px]">
          <div className="flex flex-col items-start gap-[2.119px]">
            <div className="h-[9.202px] w-[9.202px] rounded-[2.045px] border-[1.804px] border-[#F7F7F7]"></div>
            <div className="h-[9.202px] w-[9.202px] rounded-[2.045px] border-[1.804px] border-[#F7F7F7]"></div>
          </div>
          <div className="h-[20.449px] w-[9.202px] rounded-[2.045px] border-[1.804px] border-[#F7F7F7]"></div>
        </div>
      ),
      title: "Social media managing",
      description: "You should not manage dozens of accounts. We handle the technical complexity behind the scenes so you can focus on writing, publishing and connecting with readers.",
      opacity: 1
    }
  ];

  return (
    <section className="mx-auto flex w-full max-w-[1400px] flex-col items-center justify-center gap-12 px-6 py-12 lg:gap-[60px] lg:px-[115px] lg:py-[50px]">
      <h2 className="w-full text-3xl font-semibold leading-[120%] text-[#F7F7F7] md:text-4xl lg:text-[40px]">
        Here's what you get with Fable.
      </h2>

      <div className="flex w-full flex-col items-start justify-between gap-8 lg:flex-row lg:gap-4">
        {features.map((feature, index) => (
          <div
            key={index}
            className="flex w-full flex-col items-start gap-[5px] lg:w-[337px]"
            style={{ opacity: feature.opacity }}
          >
            <div className="mb-1 flex items-center gap-[10.597px]">
              {feature.icon}
              {index === 3 && (
                <span className="text-[22px] font-semibold leading-[160%] text-[#F7F7F7]">
                  {feature.title}
                </span>
              )}
            </div>
            <p className={`w-full text-[#F7F7F7] ${index === 3 ? 'text-lg leading-[150%]' : 'text-base leading-normal'}`}>
              {feature.description}
            </p>
          </div>
        ))}
      </div>

      <div className="h-[400px] w-full rounded-[25px] bg-[#D8D8D8] md:h-[600px] lg:h-[750px]"></div>
    </section>
  );
}
