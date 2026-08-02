import React, { useEffect, useRef } from 'react';
import gsap from 'gsap';

export const GShapeAnimation: React.FC = () => {
    const svgRef = useRef<SVGSVGElement>(null);

    useEffect(() => {
        const svg = svgRef.current;
        if (!svg) return;

        const ctx = gsap.context(() => {
            const paths = svg.querySelectorAll('.g-path');
            const group = svg.querySelector('.g-group');
            if (!paths.length || !group) return;

            const tl = gsap.timeline({ repeat: -1, yoyo: true, defaults: { ease: "power2.inOut" } });

            tl.fromTo(paths,
                { strokeDasharray: 300, strokeDashoffset: 300, opacity: 0.2 },
                { strokeDashoffset: 0, opacity: 1, duration: 2, stagger: 0.2 }
            )
                .to(paths, { stroke: "#a855f7", duration: 1 }, "-=1")
                .to(paths, { stroke: "#ffffff", duration: 1 }, "-=0.5");

            gsap.to(group, { rotation: 360, transformOrigin: "center", duration: 20, repeat: -1, ease: "none" });

        }, svg);

        return () => ctx.revert();
    }, []);

    return (
        <div className="w-full h-full flex items-center justify-center">
            <svg ref={svgRef} viewBox="0 0 100 100" className="w-24 h-24 opacity-80">
                <g className="g-group">
                    {/* Abstract G shape constructed from paths */}
                    <path
                        d="M 60 50 H 90 A 40 40 0 1 1 50 10"
                        fill="none"
                        stroke="white"
                        strokeWidth="4"
                        strokeLinecap="round"
                        className="g-path"
                    />
                    <circle cx="50" cy="50" r="5" fill="white" className="loading-dot">
                        <animate attributeName="opacity" values="0;1;0" dur="2s" repeatCount="indefinite" />
                    </circle>
                </g>
            </svg>
        </div>
    );
};
