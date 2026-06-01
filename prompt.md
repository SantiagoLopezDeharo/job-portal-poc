La idea principal es la siguiente:

Tenemos dos tipos de usuarios:

- postulantes
- empresas

El signup y login de usuarios debe ser gestionado por un proveedor de identidad administrado, y cuando un usuario se registra debe generarse un evento que será capturado por una función serverless para persistir los datos del nuevo usuario como un documento en una base de datos documental NoSQL.

Además, los usuarios postulantes deben poder guardar su documento CV en un bucket de almacenamiento de objetos; cuando esto sucede debe dispararse un evento para que una función serverless guarde en el documento del usuario en la base de datos un `cv_url`. El usuario debe ser identificado utilizando el user id presente en el JWT enviado.

Debemos tener 5 funciones serverless expuestas al cliente:

- (Crear trabajo) `POST "/jobs"`: Un endpoint solo para empresas. Recibe un payload de un trabajo ("Trabajo" en el esquema UML), lee el company id desde el JWT enviado en el header de la request y persiste el trabajo asociado a dicha empresa.
- (Postularse a trabajo) `POST "/jobs/applications"`: Un endpoint solo para postulantes. Recibe el id de un trabajo como payload y lee el user id desde los claims del JWT; utilizando estos 2 ids genera los documentos necesarios para representar la relación de postulación del postulante al trabajo. Cuando esto ocurre no solo persistimos el documento en la base de datos sino que también encolamos un evento en un sistema de colas/tasks con el par `(user_id, job_id)`. Luego, asincrónicamente, tenemos otra función serverless que consume estos eventos para generar un match score impulsado por IA entre el CV del postulante y la descripción del trabajo utilizando un servicio administrado de inferencia AI-as-a-Service. Si el postulante no tiene CV cargado simplemente seteamos `match_score = 1` y omitimos el procesamiento. El `match_score` generado por IA debe persistirse en el documento del usuario en la base de datos.
- (Listar postulaciones) `GET "/applications"`: Un endpoint solo para usuarios autenticados. Cuando un usuario empresa invoca este endpoint, recupera todas las postulaciones realizadas a los trabajos publicados por dicha empresa; si es un postulante recupera todas las postulaciones enviadas por él. Para ambos casos debe filtrar utilizando el user id presente en el JWT y los objetos de respuesta deben contener no solo información de la postulación sino también el título del trabajo y el nombre de la otra entidad involucrada (para empresas sería el `name + sir_name` del postulante; para postulantes sería el `legal_name` de la empresa que publicó el trabajo).
- (Listar trabajos) `GET "/jobs"`: Para empresas recupera los documentos de trabajos creados por ella; para todos los demás usuarios (postulantes y no autenticados) recupera todos los trabajos de la base de datos.
- (Aceptar / Rechazar postulaciones) `PUT "jobs/applications/:id"`: Un endpoint solo para empresas. Envía un booleano como payload y simplemente actualiza la variable booleana `accepted` en la postulación. Debemos reforzar el control de acceso utilizando el user id del JWT para evitar que empresas acepten o rechacen postulaciones pertenecientes a otras empresas.

Deberíamos poder utilizar una API Gateway administrado para manejar el routing de endpoints y los controles de acceso utilizando el JWT del proveedor de identidad.