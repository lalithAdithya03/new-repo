-- Optional demo content for trying Macro AI.
-- 1. Create two accounts through the app at /student/register and confirm both emails.
--    The one you list as v_teacher_email is promoted to teacher below (an admin-assigned role).
-- 2. Edit the two emails in the DECLARE block, then run this whole file in Supabase → SQL Editor.
--    The SQL editor runs as the database owner, which is how an administrator assigns roles.
-- It creates one published ML course built from the StudyMate sample material (with page,
-- slide and timestamp locations), a quiz, an adaptive question bank, and enrols the student.
-- Safe to re-run: it deletes and recreates the demo course.
do $$
declare
  v_teacher_email text := 'teacher@macro.test';   -- <-- change me
  v_student_email text := 'student@macro.test';   -- <-- change me
  v_teacher uuid;
  v_student uuid;
  v_course uuid;
  v_course2 uuid;
  v_quiz uuid;
  v_book uuid; v_slides uuid; v_video uuid; v_notes2 uuid;
  t_sup uuid; t_lin uuid; t_gd uuid; t_ovf uuid; t_log uuid; t_nn uuid; t_kin uuid;
  q record;
  v_qid uuid;
begin
  select id into v_teacher from public.profiles where lower(email) = lower(v_teacher_email);
  select id into v_student from public.profiles where lower(email) = lower(v_student_email);
  if v_teacher is null or v_student is null then
    raise exception 'Create both accounts in the app first (missing % or %)', v_teacher_email, v_student_email;
  end if;

  update public.profiles set role = 'teacher', institution = coalesce(institution, 'Macro AI Demo Academy') where id = v_teacher;

  delete from public.courses where teacher_id = v_teacher and code in ('ML101', 'PHY110');

  insert into public.courses (teacher_id, title, code, subject, description, difficulty, is_published)
  values (v_teacher, 'Machine Learning Foundations', 'ML101', 'Computer Science',
          'Supervised learning, regression, gradient descent, overfitting and neural networks, taught from a textbook, lecture slides and a recorded lecture.',
          'medium', true)
  returning id into v_course;

  insert into public.courses (teacher_id, title, code, subject, description, difficulty, is_published)
  values (v_teacher, 'Physics: Motion and Forces', 'PHY110', 'Physics',
          'Kinematics and Newton''s laws. Published but the demo student is not enrolled, so its materials stay hidden from them.',
          'easy', true)
  returning id into v_course2;

  insert into public.topics (course_id, name, description, prerequisites, position) values
    (v_course, 'Supervised Learning', 'Learning from labelled examples; classification vs regression.', '{}', 1),
    (v_course, 'Linear Regression', 'Predicting continuous values with a weighted sum of features.', '{Supervised Learning}', 2),
    (v_course, 'Gradient Descent', 'Minimising a loss by stepping against the gradient.', '{Linear Regression}', 3),
    (v_course, 'Overfitting', 'Memorising noise; validation sets, regularisation and early stopping.', '{Linear Regression}', 4),
    (v_course, 'Logistic Regression', 'Sigmoid of a linear score for binary classification.', '{Linear Regression}', 5),
    (v_course, 'Neural Networks', 'Layers of neurons, activations and backpropagation.', '{Gradient Descent,Logistic Regression}', 6),
    (v_course2, 'Kinematics', 'Displacement, velocity and acceleration.', '{}', 1);
  select id into t_sup from public.topics where course_id = v_course and name = 'Supervised Learning';
  select id into t_lin from public.topics where course_id = v_course and name = 'Linear Regression';
  select id into t_gd  from public.topics where course_id = v_course and name = 'Gradient Descent';
  select id into t_ovf from public.topics where course_id = v_course and name = 'Overfitting';
  select id into t_log from public.topics where course_id = v_course and name = 'Logistic Regression';
  select id into t_nn  from public.topics where course_id = v_course and name = 'Neural Networks';
  select id into t_kin from public.topics where course_id = v_course2 and name = 'Kinematics';

  insert into public.resources (course_id, owner_id, title, description, resource_type, subject, difficulty, keywords, page_count)
  values (v_course, v_teacher, 'Textbook: ML Basics', 'Core textbook chapters 1–6.', 'textbook', 'Computer Science', 'medium',
          '{regression,gradient,overfitting,sigmoid,backpropagation}', 41)
  returning id into v_book;
  insert into public.resources (course_id, owner_id, title, description, resource_type, subject, difficulty, keywords)
  values (v_course, v_teacher, 'Slides: Lecture 4', 'Classification, SGD and validation.', 'slides', 'Computer Science', 'easy',
          '{classification,sgd,minibatch,validation,early stopping}')
  returning id into v_slides;
  insert into public.resources (course_id, owner_id, title, description, resource_type, subject, difficulty, keywords)
  values (v_course, v_teacher, 'Lecture Video: Week 5', 'Recorded lecture on activations and decision boundaries.', 'video', 'Computer Science', 'hard',
          '{relu,activation,vanishing gradient,decision boundary}')
  returning id into v_video;
  insert into public.resources (course_id, owner_id, title, description, resource_type, subject, difficulty, keywords)
  values (v_course2, v_teacher, 'Notes: Equations of Motion', 'SUVAT equations with worked examples.', 'notes', 'Physics', 'easy',
          '{velocity,acceleration,suvat}')
  returning id into v_notes2;

  insert into public.resource_chunks (resource_id, course_id, topic_name, location_kind, location_label, page_number, seconds, position, content) values
    (v_book, v_course, 'Supervised Learning', 'page', 'p.3', 3, null, 1, 'Supervised learning trains a model on labeled examples, where every input is paired with a known target output. The goal is to learn a function that predicts the target for new unseen inputs.'),
    (v_book, v_course, 'Linear Regression', 'page', 'p.12', 12, null, 2, 'Linear regression predicts a continuous value as a weighted sum of input features plus a bias term. The weights are fitted by minimizing the mean squared error between predictions and targets.'),
    (v_book, v_course, 'Gradient Descent', 'page', 'p.20', 20, null, 3, 'Gradient descent minimizes a loss function by repeatedly moving the parameters in the direction of the negative gradient. The learning rate controls the size of each step taken downhill. Figure: Contour plot showing gradient descent steps converging toward the minimum of a bowl shaped loss surface.'),
    (v_book, v_course, 'Overfitting', 'page', 'p.27', 27, null, 4, 'Overfitting happens when a model memorizes noise in the training data and performs poorly on validation data. Regularization penalizes large weights to reduce variance and improve generalization.'),
    (v_book, v_course, 'Logistic Regression', 'page', 'p.33', 33, null, 5, 'Logistic regression applies the sigmoid function to a linear score to output a probability between zero and one. It is trained by minimizing the cross entropy loss for binary classification.'),
    (v_book, v_course, 'Neural Networks', 'page', 'p.41', 41, null, 6, 'A neural network stacks layers of neurons, each applying a weighted sum followed by a nonlinear activation function. Backpropagation computes the gradient of the loss with respect to every weight using the chain rule.'),
    (v_slides, v_course, 'Supervised Learning', 'slide', 'slide 2', 2, null, 1, 'Classification predicts discrete categories while regression predicts continuous quantities. Both are supervised learning tasks that need labeled data.'),
    (v_slides, v_course, 'Gradient Descent', 'slide', 'slide 7', 7, null, 2, 'Stochastic gradient descent estimates the gradient from a small random minibatch of samples. This makes each update cheap and adds helpful noise during optimization.'),
    (v_slides, v_course, 'Overfitting', 'slide', 'slide 11', 11, null, 3, 'A validation set is held out from training to detect overfitting early. Early stopping halts training when the validation loss begins to increase.'),
    (v_video, v_course, 'Neural Networks', 'timestamp', '00:04:10', null, 250, 1, 'The ReLU activation outputs zero for negative inputs and the input itself for positive inputs. It is popular because it avoids the vanishing gradient problem in deep networks.'),
    (v_video, v_course, 'Logistic Regression', 'timestamp', '00:12:45', null, 765, 2, 'The decision boundary of logistic regression is the set of points where the predicted probability equals one half. Because the score is linear, this boundary is a straight line.'),
    (v_notes2, v_course2, 'Kinematics', 'section', '§1', null, null, 1, 'Velocity is the rate of change of displacement, and acceleration is the rate of change of velocity. For constant acceleration, v = u + a t.');

  insert into public.quizzes (course_id, topic_id, created_by, title, description, difficulty, is_published)
  values (v_course, null, v_teacher, 'Week 5 Checkpoint', 'Five questions across the first half of the course.', 'medium', true)
  returning id into v_quiz;

  -- (topic, type, difficulty, prompt, options, correct option, accepted, numeric, explanation, resource, location, in quiz?)
  for q in select * from (values
    (t_sup, 'mcq', 'easy', 'What does supervised learning require for every training input?', '["A known target output (label)","A reward signal","Nothing extra","A cluster id"]', 0, null::text, null::numeric, 'Supervised learning pairs every input with a known target output.', v_book, 'p.3', true),
    (t_sup, 'mcq', 'medium', 'Which task predicts discrete categories?', '["Regression","Classification","Clustering","Dimensionality reduction"]', 1, null, null, 'Classification predicts discrete categories; regression predicts continuous quantities.', v_slides, 'slide 2', false),
    (t_lin, 'mcq', 'easy', 'Linear regression predicts a continuous value as…', '["a weighted sum of features plus a bias","the majority class of neighbours","a sigmoid probability","a decision tree leaf"]', 0, null, null, 'It is a weighted sum of input features plus a bias term.', v_book, 'p.12', true),
    (t_lin, 'numerical', 'medium', 'A linear model has weight w = 2 and bias b = 1. What is the prediction for x = 3?', '[]', null, null, 7, 'y = w·x + b = 2·3 + 1 = 7.', v_book, 'p.12', true),
    (t_lin, 'mcq', 'hard', 'Which loss is minimised to fit linear regression weights in the textbook?', '["Cross entropy","Hinge loss","Mean squared error","KL divergence"]', 2, null, null, 'The weights are fitted by minimising the mean squared error.', v_book, 'p.12', false),
    (t_gd, 'mcq', 'easy', 'Gradient descent moves parameters in which direction?', '["Along the positive gradient","Along the negative gradient","Randomly","Perpendicular to the gradient"]', 1, null, null, 'It repeatedly moves in the direction of the negative gradient.', v_book, 'p.20', true),
    (t_gd, 'short', 'medium', 'Which hyperparameter controls the size of each gradient descent step? (two words)', '[]', null, 'learning rate', null, 'The learning rate controls the size of each step taken downhill.', v_book, 'p.20', false),
    (t_gd, 'mcq', 'hard', 'Why does stochastic gradient descent use a small random minibatch?', '["To compute the exact gradient","To make each update cheap and add helpful noise","To avoid needing a loss function","To guarantee convergence in one step"]', 1, null, null, 'A minibatch estimate makes updates cheap and adds helpful noise.', v_slides, 'slide 7', false),
    (t_ovf, 'mcq', 'easy', 'Overfitting means a model…', '["memorises noise and does poorly on validation data","is too simple to fit training data","has no parameters","always generalises well"]', 0, null, null, 'Overfitting is memorising noise in training data and performing poorly on validation data.', v_book, 'p.27', true),
    (t_ovf, 'mcq', 'medium', 'What does early stopping watch to halt training?', '["Training accuracy","Validation loss","Learning rate","Number of layers"]', 1, null, null, 'Early stopping halts training when validation loss starts to increase.', v_slides, 'slide 11', false),
    (t_ovf, 'short', 'hard', 'Which technique penalises large weights to reduce variance?', '[]', null, 'regularization', null, 'Regularization penalises large weights to reduce variance.', v_book, 'p.27', false),
    (t_log, 'mcq', 'easy', 'Logistic regression applies which function to a linear score?', '["ReLU","Softplus","Sigmoid","Tanh"]', 2, null, null, 'It applies the sigmoid function to output a probability between 0 and 1.', v_book, 'p.33', false),
    (t_log, 'numerical', 'medium', 'At the decision boundary of logistic regression, what is the predicted probability?', '[]', null, null, 0.5, 'The boundary is where the predicted probability equals one half.', v_video, '00:12:45', false),
    (t_log, 'mcq', 'hard', 'Why is the logistic regression decision boundary a straight line?', '["Because the sigmoid is linear","Because the score is linear","Because cross entropy is convex","It is not; it is always curved"]', 1, null, null, 'The score is linear, so the p = 0.5 boundary is a straight line.', v_video, '00:12:45', false),
    (t_nn, 'mcq', 'easy', 'What does ReLU output for a negative input?', '["The input itself","One","Zero","Minus one"]', 2, null, null, 'ReLU outputs zero for negative inputs.', v_video, '00:04:10', false),
    (t_nn, 'mcq', 'medium', 'Backpropagation computes gradients using…', '["the chain rule","random search","the normal equation","k-means"]', 0, null, null, 'Backpropagation uses the chain rule to compute the gradient for every weight.', v_book, 'p.41', false),
    (t_nn, 'short', 'hard', 'Which problem in deep networks does ReLU help avoid? (two words)', '[]', null, 'vanishing gradient', null, 'ReLU avoids the vanishing gradient problem.', v_video, '00:04:10', false),
    (t_kin, 'numerical', 'easy', 'An object starts at u = 2 m/s with a = 3 m/s² for t = 4 s. What is v (m/s)?', '[]', null, null, 14, 'v = u + a t = 2 + 3·4 = 14 m/s.', v_notes2, '§1', false)
  ) as x(topic, qtype, diff, prompt, opts, correct, accepted, num, expl, res, loc, in_quiz) loop
    insert into public.questions (course_id, quiz_id, topic_id, created_by, question_type, prompt, options, difficulty, source_resource_id, source_location)
    values ((select course_id from public.topics where id = q.topic), case when q.in_quiz then v_quiz end, q.topic, v_teacher,
            q.qtype::public.question_type, q.prompt, q.opts::jsonb, q.diff::public.difficulty, q.res, q.loc)
    returning id into v_qid;
    insert into public.question_keys (question_id, correct_option, accepted_answers, numeric_answer, explanation)
    values (v_qid, q.correct, case when q.accepted is null then '{}' else array[q.accepted, replace(q.accepted, 'ization', 'isation')] end, q.num, q.expl);
  end loop;

  insert into public.course_enrollments (course_id, student_id) values (v_course, v_student) on conflict do nothing;
  insert into public.study_goals (student_id, title, due_on)
  select v_student, 'Finish the Week 5 Checkpoint quiz', current_date + 2
  where not exists (select 1 from public.study_goals where student_id = v_student);
end $$;
