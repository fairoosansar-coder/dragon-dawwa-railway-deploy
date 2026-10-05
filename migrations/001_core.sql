CREATE TABLE IF NOT EXISTS editorial_documents (
  id VARCHAR(64) NOT NULL PRIMARY KEY,
  created_by VARCHAR(200) NOT NULL,
  created_at VARCHAR(35) NOT NULL,
  head INT NOT NULL,
  published INT NULL
);

CREATE TABLE IF NOT EXISTS editorial_revisions (
  document_id VARCHAR(64) NOT NULL,
  version INT NOT NULL,
  state VARCHAR(35) NOT NULL,
  content LONGTEXT NOT NULL,
  actor VARCHAR(200) NOT NULL,
  role VARCHAR(35) NOT NULL,
  action VARCHAR(35) NOT NULL,
  note TEXT NOT NULL,
  created_at VARCHAR(35) NOT NULL,
  PRIMARY KEY (document_id, version),
  CONSTRAINT fk_revision_document FOREIGN KEY (document_id) REFERENCES editorial_documents(id)
);

CREATE TABLE IF NOT EXISTS review_roles (
  user_id VARCHAR(200) NOT NULL PRIMARY KEY,
  role VARCHAR(20) NOT NULL,
  disabled TINYINT NOT NULL DEFAULT 0,
  updated_at VARCHAR(35) NOT NULL,
  updated_by VARCHAR(200) NOT NULL
);
