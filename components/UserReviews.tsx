import React, { useState, useEffect } from 'react';
import { rds } from '../services/rdsApi';
import { Star, ArrowRight, Quote } from 'lucide-react';
import { Link } from 'react-router-dom';

interface Review {
  id: string;
  name: string;
  review: string;
  rating: number;
  userType?: 'student' | 'recruiter';
}

const StarDisplay: React.FC<{ rating: number }> = ({ rating }) => (
  <div className="flex gap-1">
    {[...Array(5)].map((_, i) => (
      <Star
        key={i}
        size={18}
        className="text-yellow-400"
        fill={i < rating ? 'currentColor' : 'none'}
      />
    ))}
  </div>
);

const UserReviews: React.FC = () => {
  const [reviews, setReviews] = useState<Review[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchReviews = async () => {
      try {
        const { reviews: fetched } = await rds.listReviews();
        setReviews(fetched.slice(0, 6));
      } catch (error) {
        console.error("Error fetching reviews:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchReviews();
  }, []);

  if (loading) {
    return null; // Don't show anything while loading
  }

  if (reviews.length === 0) {
    return null; // Don't render the section if there are no approved reviews
  }

  return (
    <section className="py-16 sm:py-24 bg-gray-50 dark:bg-[#0a0a0a]">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center">
          <h2 className="text-3xl font-extrabold text-gray-900 dark:text-white sm:text-4xl">
            What Our Users Say
          </h2>
          <p className="mt-4 text-lg text-gray-500 dark:text-gray-400">
            Trusted by professionals and recruiters worldwide.
          </p>
        </div>
        <div className="mt-12 grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
          {reviews.map((review) => (
            <div key={review.id} className="bg-white dark:bg-white/5 backdrop-blur-sm border border-slate-200 dark:border-white/10 rounded-3xl p-8 flex flex-col transition-all duration-300 hover:shadow-2xl hover:shadow-blue-500/10 hover:-translate-y-2 hover:scale-[1.02] hover:border-blue-400 dark:hover:border-blue-500/50 group">
              <div className="flex-1 mb-8 relative">
                <Quote className="absolute -top-5 -left-5 w-16 h-16 text-gray-100 dark:text-white/5 transition-colors duration-300" />
                <StarDisplay rating={review.rating} />
                <p className="mt-5 text-gray-700 dark:text-gray-300 text-base leading-relaxed relative z-10">
                  {review.review}
                </p>
              </div>
              <div className="flex items-center gap-4">
                <div className={`w-12 h-12 rounded-full flex items-center justify-center text-white font-bold text-lg shadow-lg ${review.userType === 'recruiter' ? 'bg-gradient-to-br from-blue-500 to-indigo-600' : 'bg-gradient-to-br from-green-500 to-teal-600'}`}>
                  {review.name.split(' ').map(n => n[0]).join('')}
                </div>
                <div className="flex-1">
                  <p className="font-bold text-gray-900 dark:text-white">{review.name}</p>
                  {review.userType && (
                      <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${
                          review.userType === 'recruiter' 
                          ? 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300' 
                          : 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300'
                      }`}>
                          {review.userType.charAt(0).toUpperCase() + review.userType.slice(1)}
                      </span>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
        <div className="mt-12 text-center">
          <Link to="/reviews" className="inline-flex items-center gap-2 px-6 py-3 border border-transparent text-base font-medium rounded-md text-white bg-primary hover:bg-primary-dark">
            See All Reviews <ArrowRight size={20} />
          </Link>
        </div>
      </div>
    </section>
  );
};

export default UserReviews;